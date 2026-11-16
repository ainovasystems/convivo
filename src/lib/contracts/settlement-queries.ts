import "server-only";

import { classifyExit, entryMatch, type SettlementItemRow, type SettlementRow } from "@/lib/contracts/settlement";
import { getInventory, type InventoryItemView, type InventoryView } from "@/lib/contracts/inventory-queries";
import { createClient } from "@/lib/supabase/server";

const SETTLEMENT_COLUMNS =
  "id, contract_id, status, deposit_amount, sent_at, sent_hash, responded_at, landlord_confirmed_at, tenant_confirmed_at, locked_at, final_hash, created_at";
const ITEM_COLUMNS = "id, sort_order, concept, amount, inventory_item_id, tenant_response, tenant_comment, responded_at";

/** Partida con el elemento del inventario al que se refiere (entrada y salida, con fotos). */
export type SettlementItemView = SettlementItemRow & {
  exit: InventoryItemView | null;
  entry: InventoryItemView | null;
};

export type SettlementView = {
  settlement: SettlementRow;
  items: SettlementItemView[];
  /** Daños nuevos todavía sin partida (solo se calcula para el casero y en preparación). */
  candidates: { exit: InventoryItemView; entry: InventoryItemView | null }[];
  /** Elementos con desgaste por uso normal: se avisan como no descontables. */
  wear: InventoryItemView[];
  entryInventory: InventoryView | null;
  exitInventory: InventoryView | null;
};

/** Resumen ligero para el apartado «Fianza»: ¿existe la liquidación y en qué estado? */
export async function getSettlementSummary(contractId: string) {
  const supabase = await createClient();
  const [{ data: settlement }, { data: exitInv }] = await Promise.all([
    supabase.from("contract_settlements").select("id, status, locked_at, landlord_confirmed_at, tenant_confirmed_at, deposit_amount").eq("contract_id", contractId).maybeSingle(),
    supabase.from("contract_inventories").select("locked_at").eq("contract_id", contractId).eq("stage", "exit").maybeSingle(),
  ]);
  return { settlement: settlement ?? null, exitLocked: Boolean(exitInv?.locked_at) };
}

/** Liquidación completa con partidas, elementos de entrada y salida y sus fotos. RLS: solo las partes. */
export async function getSettlementView(contractId: string): Promise<SettlementView | null> {
  const supabase = await createClient();
  const { data: settlement } = await supabase.from("contract_settlements").select(SETTLEMENT_COLUMNS).eq("contract_id", contractId).maybeSingle();
  if (!settlement) return null;
  const { data: rows } = await supabase.from("settlement_items").select(ITEM_COLUMNS).eq("settlement_id", settlement.id).order("sort_order").order("id");
  const [entryInventory, exitInventory] = await Promise.all([getInventory(contractId, "entry"), getInventory(contractId, "exit")]);

  const exitItems = exitInventory?.items ?? [];
  const entryItems = entryInventory?.items ?? [];
  const items: SettlementItemView[] = ((rows ?? []) as SettlementItemRow[]).map((r) => {
    const exit = exitItems.find((e) => e.id === r.inventory_item_id) ?? null;
    return { ...r, exit, entry: exit ? entryMatch(entryItems, exit) : null };
  });

  const used = new Set(items.map((i) => i.inventory_item_id).filter(Boolean));
  const { newDamages, wear } = classifyExit(exitItems, entryItems);
  return {
    settlement: settlement as SettlementRow,
    items,
    candidates: newDamages.filter((d) => !used.has(d.id)).map((d) => ({ exit: d, entry: entryMatch(entryItems, d) })),
    wear,
    entryInventory,
    exitInventory,
  };
}
