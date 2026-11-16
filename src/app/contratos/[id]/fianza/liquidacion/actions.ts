"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { emailOtherParty } from "@/lib/contracts/deposit-notify";
import { settlementAnswersSchema, settlementItemSchema } from "@/lib/contracts/settlement";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

export type SettlementResult = { ok: boolean; message?: string; errors?: Record<string, string> };

const uuid = z.uuid();
const PATH = "/fianza/liquidacion";
const NOT_FOUND: SettlementResult = { ok: false, message: "Liquidación no encontrada." };
const LOGIN: SettlementResult = { ok: false, message: "Inicia sesión para continuar." };

/** El casero abre la liquidación (con el inventario de salida bloqueado). */
export async function openSettlement(contractId: string): Promise<SettlementResult> {
  if (!uuid.safeParse(contractId).success) return NOT_FOUND;
  if (!(await getCurrentUser())) return LOGIN;
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_settlement", { p_contract_id: contractId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Liquidación abierta. Añade las partidas y envíala a tu inquilino." };
}

/** Añade (itemId = null) o corrige una partida. `amount` llega como texto del formulario. */
export async function saveSettlementItem(
  settlementId: string,
  itemId: string | null,
  input: { concept: string; amount: string; inventory_item_id: string | null },
): Promise<SettlementResult> {
  if (!uuid.safeParse(settlementId).success || (itemId !== null && !uuid.safeParse(itemId).success)) return NOT_FOUND;
  if (!(await getCurrentUser())) return LOGIN;
  const parsed = settlementItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_settlement_item", {
    p_settlement_id: settlementId,
    // La función admite NULL para «partida nueva»; los tipos generados no lo reflejan.
    p_item_id: itemId as string,
    p_concept: parsed.data.concept,
    p_amount: parsed.data.amount,
    ...(parsed.data.inventory_item_id ? { p_inventory_item_id: parsed.data.inventory_item_id } : {}),
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Partida guardada." };
}

export async function deleteSettlementItem(itemId: string): Promise<SettlementResult> {
  if (!uuid.safeParse(itemId).success) return NOT_FOUND;
  if (!(await getCurrentUser())) return LOGIN;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_settlement_item", { p_item_id: itemId });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Partida quitada." };
}

/** El casero envía la liquidación al inquilino. */
export async function sendSettlement(contractId: string, settlementId: string): Promise<SettlementResult> {
  if (!uuid.safeParse(contractId).success || !uuid.safeParse(settlementId).success) return NOT_FOUND;
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_settlement", { p_settlement_id: settlementId });
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo enviar." };
  await emailOtherParty(contractId, user.id, "settlement_sent", PATH);
  return { ok: true, message: "Enviada. Tu inquilino responderá a cada partida." };
}

/** El inquilino responde partida por partida. */
export async function respondSettlement(
  contractId: string,
  settlementId: string,
  answers: { item_id: string; response: string; comment: string }[],
): Promise<SettlementResult> {
  if (!uuid.safeParse(contractId).success || !uuid.safeParse(settlementId).success) return NOT_FOUND;
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const parsed = settlementAnswersSchema.safeParse(answers);
  if (!parsed.success) {
    // El primer error indica la partida concreta (índice) para que el formulario lo marque.
    const issue = parsed.error.issues[0];
    const index = typeof issue.path[0] === "number" ? issue.path[0] : null;
    return { ok: false, message: issue.message, errors: index !== null ? { [`answer-${index}`]: issue.message } : undefined };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_settlement", { p_settlement_id: settlementId, p_responses: parsed.data });
  if (error) return { ok: false, message: error.message };
  await emailOtherParty(contractId, user.id, "settlement_answered", PATH);
  return { ok: true, message: "Respuestas enviadas. Falta que los dos confirméis la liquidación." };
}

/** El casero reabre la liquidación (vuelve a «en preparación»). */
export async function reopenSettlement(contractId: string, settlementId: string): Promise<SettlementResult> {
  if (!uuid.safeParse(contractId).success || !uuid.safeParse(settlementId).success) return NOT_FOUND;
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_settlement", { p_settlement_id: settlementId });
  if (error) return { ok: false, message: error.message };
  await emailOtherParty(contractId, user.id, "settlement_reopened", PATH);
  return { ok: true, message: "Reabierta. Las respuestas anteriores quedan en la cronología." };
}

/** Cada parte confirma la liquidación respondida. */
export async function confirmSettlement(contractId: string, settlementId: string): Promise<SettlementResult> {
  if (!uuid.safeParse(contractId).success || !uuid.safeParse(settlementId).success) return NOT_FOUND;
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_settlement", { p_settlement_id: settlementId });
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo confirmar." };
  const locked = Boolean(data.locked_at);
  await emailOtherParty(contractId, user.id, locked ? "settlement_locked" : "settlement_to_confirm", PATH);
  return { ok: true, message: locked ? "Confirmada por las dos partes: la liquidación queda cerrada." : "Confirmada. Falta la confirmación de la otra parte." };
}
