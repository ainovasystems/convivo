"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { CONTRACT_KINDS, contractKindErrors, contractTermsSchema, TEMPLATE_VERSION, type ContractKind } from "@/lib/contracts/schema";
import { buildDraftFromInterest, getContract } from "@/lib/contracts/queries";
import { contractToText, renderContract } from "@/lib/contracts/templates";
import { emailUser } from "@/lib/email/notify";
import { contractSignedEmail, contractToSignEmail } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

export type ContractResult = { ok: boolean; message?: string; errors?: Record<string, string> };

const uuid = z.uuid();

/** Crea el borrador desde una conversación con interés aceptado y abre el editor. */
export async function createContractDraft(formData: FormData): Promise<void> {
  const interestId = uuid.safeParse(formData.get("interestId"));
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  if (!interestId.success) redirect("/mensajes");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("interest_id", interestId.data)
    .in("status", ["draft", "sent"])
    .maybeSingle();
  if (existing) redirect(`/contratos/${existing.id}`);

  const draft = await buildDraftFromInterest(interestId.data, user.id);
  if (!draft) redirect(`/mensajes/${interestId.data}`);
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      listing_id: draft.listing.id,
      interest_id: draft.interestId,
      landlord_id: user.id,
      tenant_id: draft.tenantId,
      kind: draft.kind,
      template_version: TEMPLATE_VERSION,
      terms: draft.terms,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/mensajes/${interestId.data}`);
  redirect(`/contratos/${data.id}`);
}

const saveSchema = z.object({ kind: z.enum(CONTRACT_KINDS), terms: z.unknown() });

/** Guarda el borrador (solo el casero, solo en borrador: la BD lo impone). */
export async function saveContractDraft(id: string, input: unknown): Promise<ContractResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Contrato no encontrado." };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const terms = contractTermsSchema.safeParse(parsed.data.terms);
  if (!terms.success) return { ok: false, errors: fieldErrors(terms.error), message: "Revisa los campos marcados." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ kind: parsed.data.kind, terms: terms.data, template_version: TEMPLATE_VERSION })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Borrador guardado." };
}

/** Envía a firmar: genera el texto definitivo en el servidor y lo sella en la BD. */
export async function sendContract(id: string, input: unknown): Promise<ContractResult> {
  const saved = await saveContractDraft(id, input);
  if (!saved.ok) return saved;
  const user = await getCurrentUser();
  const contract = await getContract(id);
  if (!user || !contract || contract.landlord_id !== user.id) return { ok: false, message: "Contrato no encontrado." };

  const kind = contract.kind as ContractKind;
  const terms = contractTermsSchema.parse(contract.terms);
  const kindErrors = contractKindErrors(kind, terms);
  if (Object.keys(kindErrors).length) return { ok: false, errors: kindErrors, message: "Faltan datos para este tipo de contrato." };

  const text = contractToText(
    renderContract(kind, terms, {
      city: contract.listing?.city ?? null,
      contractId: contract.id,
      landlordId: contract.landlord_id,
      tenantId: contract.tenant_id,
    }),
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_contract", { p_contract_id: id, p_document_text: text });
  if (error) return { ok: false, message: error.message };

  const url = `${await getSiteUrl()}/contratos/${id}`;
  await emailUser(contract.tenant_id, () =>
    contractToSignEmail({
      name: contract.tenant?.display_name ?? "",
      landlordName: contract.landlord?.display_name ?? "",
      listingTitle: contract.listing?.title ?? "el anuncio",
      url,
    }),
  );
  revalidatePath(`/contratos/${id}`);
  return { ok: true, message: "Contrato enviado para firmar." };
}

const signSchema = z.object({
  fullName: z.string().trim().min(5, { error: "Escribe tu nombre completo" }).max(120),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  accept: z.literal(true, { error: "Tienes que confirmar que has leído y aceptas el contrato" }),
});

export async function signContract(id: string, input: unknown): Promise<ContractResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Contrato no encontrado." };
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_contract", {
    p_contract_id: id,
    p_full_name: parsed.data.fullName,
    p_document_hash: parsed.data.hash,
  });
  if (error) return { ok: false, message: error.message };

  if (data?.status === "signed") {
    const contract = await getContract(id);
    const url = `${await getSiteUrl()}/contratos/${id}`;
    for (const party of [
      { id: data.landlord_id, name: contract?.landlord?.display_name },
      { id: data.tenant_id, name: contract?.tenant?.display_name },
    ]) {
      await emailUser(party.id, () =>
        contractSignedEmail({ name: party.name ?? "", listingTitle: contract?.listing?.title ?? "el anuncio", url }),
      );
    }
  }
  return { ok: true, message: data?.status === "signed" ? "Contrato firmado por las dos partes." : "Has firmado. Falta la otra parte." };
}

export async function cancelContract(id: string): Promise<ContractResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Contrato no encontrado." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_contract", { p_contract_id: id });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Contrato cancelado." };
}
