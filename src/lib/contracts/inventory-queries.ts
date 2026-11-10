import "server-only";

import type { InventoryStage, ItemCondition } from "@/lib/contracts/inventory";
import { createClient } from "@/lib/supabase/server";

export type InventoryItemView = {
  id: string;
  area: string;
  name: string;
  condition: ItemCondition;
  notes: string;
  photos: { path: string; url: string | null }[];
  created_by: string | null;
  created_at: string;
};

export type InventoryView = {
  id: string;
  stage: InventoryStage;
  landlord_confirmed_at: string | null;
  tenant_confirmed_at: string | null;
  locked_at: string | null;
  items: InventoryItemView[];
};

/** Inventarios del contrato (entrada y salida), si existen. RLS: solo las partes. */
export async function listContractInventories(contractId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_inventories")
    .select("id, stage, landlord_confirmed_at, tenant_confirmed_at, locked_at")
    .eq("contract_id", contractId);
  return data ?? [];
}

/** Un inventario con sus elementos y enlaces firmados (1 h) a las fotos privadas. */
export async function getInventory(contractId: string, stage: InventoryStage): Promise<InventoryView | null> {
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("contract_inventories")
    .select("id, stage, landlord_confirmed_at, tenant_confirmed_at, locked_at")
    .eq("contract_id", contractId)
    .eq("stage", stage)
    .maybeSingle();
  if (!inv) return null;

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, area, name, condition, notes, photos, created_by, created_at")
    .eq("inventory_id", inv.id)
    .order("created_at", { ascending: true })
    .limit(200);
  const paths = (items ?? []).flatMap((i) => i.photos);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("inventory-photos").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return {
    ...inv,
    items: (items ?? []).map((i) => ({ ...i, photos: i.photos.map((p) => ({ path: p, url: urls.get(p) ?? null })) })),
  };
}
