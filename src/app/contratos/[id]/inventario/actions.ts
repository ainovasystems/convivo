"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  INVENTORY_STAGES,
  INVENTORY_STALE_CODE,
  INVENTORY_STALE_MESSAGE,
  inventoryItemEditSchema,
  inventoryItemSchema,
  isInventoryPhotoPath,
} from "@/lib/contracts/inventory";
import { emailUser } from "@/lib/email/notify";
import { inventoryToConfirmEmail } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

export type InventoryResult = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  inventoryId?: string;
  /** El inventario cambió desde que se abrió: no se ha guardado la confirmación. */
  stale?: boolean;
};

const uuid = z.uuid();

/** Abre el inventario (entrada o salida). La BD exige contrato firmado y, para la salida, la entrada confirmada. */
export async function openInventory(contractId: string, stage: string): Promise<InventoryResult> {
  const s = z.enum(INVENTORY_STAGES).safeParse(stage);
  if (!uuid.safeParse(contractId).success || !s.success) return { ok: false, message: "Inventario no encontrado." };
  if (!(await getCurrentUser())) return { ok: false, message: "Inicia sesión para continuar." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_inventories")
    .insert({ contract_id: contractId, stage: s.data })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo abrir el inventario." };
  return { ok: true, inventoryId: data.id };
}

async function inventoryContext(inventoryId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_inventories")
    .select("id, stage, contract_id, locked_at")
    .eq("id", inventoryId)
    .maybeSingle();
  return { supabase, inv: data };
}

/** Añade un elemento. Las fotos ya están subidas desde el navegador a su carpeta. */
export async function addInventoryItem(inventoryId: string, input: unknown): Promise<InventoryResult> {
  if (!uuid.safeParse(inventoryId).success) return { ok: false, message: "Inventario no encontrado." };
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };
  const { supabase, inv } = await inventoryContext(inventoryId);
  if (!inv) return { ok: false, message: "Inventario no encontrado." };
  if (parsed.data.photos.some((p) => !isInventoryPhotoPath(p, inv.contract_id, inv.id))) {
    return { ok: false, message: "Alguna foto no es válida. Vuelve a subirla." };
  }
  const { error } = await supabase.from("inventory_items").insert({ inventory_id: inv.id, ...parsed.data });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Elemento añadido." };
}

/**
 * Corrige un elemento (estado, notas y fotos) sin quitarlo: conserva la zona y
 * el nombre, y con ellos la comparación entre la entrada y la salida. Las fotos
 * que se quitan se borran del bucket. La BD anula las confirmaciones.
 */
export async function updateInventoryItem(itemId: string, input: unknown): Promise<InventoryResult> {
  if (!uuid.safeParse(itemId).success) return { ok: false, message: "Elemento no encontrado." };
  const parsed = inventoryItemEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };
  if (!(await getCurrentUser())) return { ok: false, message: "Tu sesión ha caducado. Vuelve a entrar." };
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items").select("id, inventory_id, photos").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "Elemento no encontrado." };
  const { inv } = await inventoryContext(item.inventory_id);
  if (!inv) return { ok: false, message: "Inventario no encontrado." };
  if (parsed.data.photos.some((p) => !isInventoryPhotoPath(p, inv.contract_id, inv.id))) {
    return { ok: false, message: "Alguna foto no es válida. Vuelve a subirla." };
  }
  const { error } = await supabase
    .from("inventory_items")
    .update({ condition: parsed.data.condition, notes: parsed.data.notes, photos: parsed.data.photos })
    .eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  const dropped = item.photos.filter((p) => !parsed.data.photos.includes(p));
  if (dropped.length > 0) await supabase.storage.from("inventory-photos").remove(dropped);
  return { ok: true, message: "Elemento corregido. Las confirmaciones se han anulado: hay que volver a confirmar." };
}

/** Quita un elemento y borra sus fotos del bucket. */
export async function deleteInventoryItem(itemId: string): Promise<InventoryResult> {
  if (!uuid.safeParse(itemId).success) return { ok: false, message: "Elemento no encontrado." };
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items").select("id, photos").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "Elemento no encontrado." };
  const { error } = await supabase.from("inventory_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  if (item.photos.length > 0) await supabase.storage.from("inventory-photos").remove(item.photos);
  return { ok: true, message: "Elemento quitado." };
}

/** Borra fotos subidas que al final no se guardaron (el usuario canceló). */
export async function discardInventoryPhotos(inventoryId: string, paths: string[]): Promise<void> {
  if (!uuid.safeParse(inventoryId).success) return;
  const { supabase, inv } = await inventoryContext(inventoryId);
  if (!inv) return;
  const valid = paths.filter((p) => isInventoryPhotoPath(p, inv.contract_id, inv.id)).slice(0, 20);
  if (valid.length > 0) await supabase.storage.from("inventory-photos").remove(valid);
}

/** Copia los elementos de la entrada a la salida (sin fotos), para revisar uno a uno. */
export async function copyEntryItems(exitInventoryId: string): Promise<InventoryResult> {
  if (!uuid.safeParse(exitInventoryId).success) return { ok: false, message: "Inventario no encontrado." };
  const { supabase, inv } = await inventoryContext(exitInventoryId);
  if (!inv || inv.stage !== "exit") return { ok: false, message: "Inventario no encontrado." };
  const { data: entry } = await supabase
    .from("contract_inventories")
    .select("id")
    .eq("contract_id", inv.contract_id)
    .eq("stage", "entry")
    .maybeSingle();
  if (!entry) return { ok: false, message: "No hay inventario de entrada." };
  const [{ data: entryItems }, { count }] = await Promise.all([
    supabase.from("inventory_items").select("area, name, condition").eq("inventory_id", entry.id).order("created_at").limit(150),
    supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("inventory_id", inv.id),
  ]);
  if ((count ?? 0) > 0) return { ok: false, message: "El inventario de salida ya tiene elementos." };
  if (!entryItems?.length) return { ok: false, message: "El inventario de entrada está vacío." };
  const { error } = await supabase
    .from("inventory_items")
    .insert(entryItems.map((i) => ({ inventory_id: inv.id, area: i.area, name: i.name, condition: i.condition, notes: "" })));
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${entryItems.length === 1 ? "1 elemento copiado" : `${entryItems.length} elementos copiados`}. Revisa el estado de cada uno y añade fotos.` };
}

/**
 * Confirma el inventario por la parte que llama; si es la primera, avisa por email a la otra.
 * Solo se confirma lo que se ha visto (hallazgo B1 de la auditoría).
 */
export async function confirmInventory(inventoryId: string, revision: number): Promise<InventoryResult> {
  if (!uuid.safeParse(inventoryId).success || !Number.isInteger(revision)) return { ok: false, message: "Inventario no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const supabase = await createClient();
  // `revision` es la versión que tenía delante quien confirma: si la otra parte
  // cambió algo mientras tanto, la BD no guarda la confirmación.
  const { data, error } = await supabase.rpc("confirm_inventory", { p_inventory_id: inventoryId, p_revision: revision });
  if (error?.code === INVENTORY_STALE_CODE) return { ok: false, stale: true, message: INVENTORY_STALE_MESSAGE };
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo confirmar." };

  if (!data.locked_at) {
    const { data: contract } = await supabase
      .from("contracts")
      .select("id, landlord_id, tenant_id")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (contract) {
      const other = contract.landlord_id === user.id ? contract.tenant_id : contract.landlord_id;
      const slug = data.stage === "entry" ? "entrada" : "salida";
      const site = await getSiteUrl();
      await emailUser(other, () => inventoryToConfirmEmail({ stage: data.stage, url: `${site}/contratos/${contract.id}/inventario/${slug}` }));
    }
    return { ok: true, message: "Confirmado. Falta que lo confirme la otra parte." };
  }
  return { ok: true, message: "Inventario confirmado por los dos. Ya no se puede cambiar." };
}
