import "server-only";

import { EMPTY_DEPOSIT, madridToday, type DepositRow } from "@/lib/contracts/deposit-tracking";
import { createClient } from "@/lib/supabase/server";

// Sin receipt_path: el documento del resguardo solo lo ve el casero (permisos por columna).
const DEPOSIT_COLUMNS =
  "status, deposited_on, receipt_number, has_receipt, deposit_recorded_at, keys_declared_on, keys_declared_at, keys_confirmed_at, keys_confirmation, return_due_on, return_marked_on, return_marked_at, return_response, return_response_at";

export type DepositEvent = { id: number; kind: string; actor_id: string | null; created_at: string };

export type DepositView = {
  row: DepositRow;
  /** ¿Existe ya la fila de seguimiento? (se crea con la primera acción) */
  tracked: boolean;
  events: DepositEvent[];
  /** Enlace firmado (1 h) al resguardo: solo para el casero. */
  receiptUrl: string | null;
  /** El inquilino puede declarar la entrega de llaves (la estancia ha terminado). */
  canDeclareKeys: boolean;
};

/** Seguimiento de la fianza de un contrato. RLS: solo las partes. */
export async function getDepositView(
  contract: { id: string; stay_id: string | null; terms: unknown },
  isLandlord: boolean,
): Promise<DepositView> {
  const supabase = await createClient();
  const [{ data: row }, { data: events }, { data: stay }] = await Promise.all([
    supabase.from("contract_deposits").select(DEPOSIT_COLUMNS).eq("contract_id", contract.id).maybeSingle(),
    supabase.from("contract_deposit_events").select("id, kind, actor_id, created_at").eq("contract_id", contract.id).order("created_at").order("id").limit(100),
    contract.stay_id ? supabase.from("stays").select("status").eq("id", contract.stay_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let receiptUrl: string | null = null;
  if (isLandlord && row?.has_receipt) {
    const { data: path } = await supabase.rpc("deposit_receipt_path", { p_contract_id: contract.id });
    if (path) {
      const { data: signed } = await supabase.storage.from("deposit-receipts").createSignedUrl(path, 3600);
      receiptUrl = signed?.signedUrl ?? null;
    }
  }

  const endDate = (contract.terms as { end_date?: string | null } | null)?.end_date ?? null;
  const canDeclareKeys = stay?.status === "ended" || Boolean(endDate && endDate <= madridToday());
  return { row: (row as DepositRow | null) ?? EMPTY_DEPOSIT, tracked: Boolean(row), events: events ?? [], receiptUrl, canDeclareKeys };
}
