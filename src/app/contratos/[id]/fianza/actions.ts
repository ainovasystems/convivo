"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  RECEIPT_EXTENSIONS,
  RECEIPT_MAX_BYTES,
  dateOnlySchema,
  recordDepositSchema,
  returnSchema,
  sniffReceiptType,
} from "@/lib/contracts/deposit-tracking";
import { emailOtherParty } from "@/lib/contracts/deposit-notify";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

export type DepositResult = { ok: boolean; message?: string; errors?: Record<string, string> };

const uuid = z.uuid();
const BUCKET = "deposit-receipts";

/** El casero anota el depósito (fecha y número) y, si quiere, sube el resguardo. */
export async function recordDeposit(contractId: string, formData: FormData): Promise<DepositResult> {
  if (!uuid.safeParse(contractId).success) return { ok: false, message: "Contrato no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const parsed = recordDepositSchema.safeParse({
    deposited_on: formData.get("deposited_on"),
    receipt_number: formData.get("receipt_number"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };

  const supabase = await createClient();
  let path: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > RECEIPT_MAX_BYTES) return { ok: false, errors: { receipt: "El resguardo pesa demasiado (máximo 2,5 MB)" }, message: "Revisa los campos marcados." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = sniffReceiptType(bytes);
    if (!ext) return { ok: false, errors: { receipt: "Sube un PDF o una imagen (JPG, PNG o WebP)" }, message: "Revisa los campos marcados." };
    path = `${contractId}/${randomUUID()}.${ext}`;
    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: RECEIPT_EXTENSIONS[ext] });
    if (upError) return { ok: false, message: "No se pudo subir el resguardo. Inténtalo de nuevo." };
  }

  const { error } = await supabase.rpc("record_deposit", {
    p_contract_id: contractId,
    p_deposited_on: parsed.data.deposited_on,
    p_receipt_number: parsed.data.receipt_number,
    ...(path ? { p_receipt_path: path } : {}),
  });
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Anotado. Tu inquilino lo verá en el contrato." };
}

/** El inquilino declara la fecha de entrega de llaves. */
export async function declareKeys(contractId: string, date: string): Promise<DepositResult> {
  if (!uuid.safeParse(contractId).success) return { ok: false, message: "Contrato no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const parsed = dateOnlySchema.safeParse({ date });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa la fecha." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("declare_keys_handover", { p_contract_id: contractId, p_keys_on: parsed.data.date });
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo guardar." };
  await emailOtherParty(contractId, user.id, "keys_declared");
  return { ok: true, message: "Declarado. Consta como declarada por ti y sin confirmar hasta que tu casero la confirme; a él le llegarán recordatorios." };
}

/** El casero confirma la entrega de llaves: empieza el plazo de un mes. */
export async function confirmKeys(contractId: string): Promise<DepositResult> {
  if (!uuid.safeParse(contractId).success) return { ok: false, message: "Contrato no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_keys_handover", { p_contract_id: contractId });
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo confirmar." };
  await emailOtherParty(contractId, user.id, "keys_confirmed");
  return { ok: true, message: "Confirmado. Ya corre el plazo de un mes para devolver la fianza." };
}

/** El casero marca la fianza como devuelta (fecha e importe devuelto, este último opcional e informativo). */
export async function markReturned(contractId: string, date: string, amount: string): Promise<DepositResult> {
  if (!uuid.safeParse(contractId).success) return { ok: false, message: "Contrato no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const parsed = returnSchema.safeParse({ date, amount });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_deposit_returned", {
    p_contract_id: contractId,
    p_returned_on: parsed.data.date,
    ...(parsed.data.amount !== null ? { p_returned_amount: parsed.data.amount } : {}),
  });
  if (error) return { ok: false, message: error.message };
  await emailOtherParty(contractId, user.id, "return_marked");
  return { ok: true, message: "Marcado. Falta que tu inquilino confirme que la ha recibido." };
}

/** El inquilino confirma la devolución o indica que no la ha recibido. */
export async function respondReturn(contractId: string, received: boolean): Promise<DepositResult> {
  if (!uuid.safeParse(contractId).success) return { ok: false, message: "Contrato no encontrado." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Inicia sesión para continuar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_deposit_return", { p_contract_id: contractId, p_received: received });
  if (error) return { ok: false, message: error.message };
  await emailOtherParty(contractId, user.id, received ? "return_confirmed" : "return_disputed");
  return { ok: true, message: received ? "Confirmado. La devolución queda registrada." : "Anotado. Tu casero lo verá y podrá volver a marcarla." };
}

