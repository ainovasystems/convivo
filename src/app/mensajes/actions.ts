"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { chatMessageSchema, interestMessageSchema, participantSchema, proposeStaySchema } from "@/lib/conversations/schema";
import { interestAcceptedEmail, newInterestEmail, stayProposedEmail } from "@/lib/email/templates";
import { emailUser } from "@/lib/email/notify";
import type { FormState } from "@/lib/forms";
import { formatShortDate } from "@/lib/listings/options";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

const SESSION_EXPIRED: FormState = { status: "error", message: "Tu sesión ha caducado. Vuelve a entrar." };

/**
 * Los triggers y RPC de la BD devuelven mensajes en español pensados para el
 * usuario; los errores de restricciones técnicas se traducen aquí.
 */
function dbErrorMessage(error: { message: string; code?: string }): string {
  if (error.message.includes("interests_unique_per_user")) return "Ya mostraste interés en este anuncio.";
  if (error.message.includes("stays_one_open_per_guest")) return "Ya hay una estancia pendiente o activa para este anuncio.";
  if (error.message.includes("stay_participants_pkey")) return "Esa persona ya está añadida a la estancia.";
  if (error.message.includes("foreign key")) return "No encontramos a esa persona en Convivo.";
  if (error.code === "42501" || error.message.includes("row-level security")) return "No tienes permiso para hacer esto.";
  return /^[A-ZÁÉÍÓÚ¿¡]/.test(error.message) ? error.message : "No se ha podido completar la acción.";
}

const conversationUrl = async (interestId: string) => `${await getSiteUrl()}/mensajes/${interestId}`;

function refresh(interestId?: string) {
  revalidatePath("/mensajes");
  if (interestId) revalidatePath(`/mensajes/${interestId}`);
  revalidatePath("/mis-estancias");
}

// -----------------------------------------------------------------------------
// Interés
// -----------------------------------------------------------------------------

export async function expressInterest(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = interestMessageSchema.safeParse({
    listingId: formData.get("listingId"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interests")
    .insert({ listing_id: parsed.data.listingId, from_user: user.id, message: parsed.data.message })
    .select("id, listing:listings!interests_listing_id_fkey(title, owner_id, owner:profiles!listings_owner_id_fkey(display_name)), guest:profiles!interests_from_user_fkey(display_name)")
    .single();
  if (error || !data) return { status: "error", message: dbErrorMessage(error ?? { message: "" }) };

  // El primer mensaje del chat es el mensaje del interés.
  await supabase.from("messages").insert({ interest_id: data.id, sender_id: user.id, body: parsed.data.message });

  const listing = data.listing;
  if (listing) {
    const url = await conversationUrl(data.id);
    await emailUser(listing.owner_id, () =>
      newInterestEmail({
        ownerName: listing.owner?.display_name ?? "",
        guestName: data.guest?.display_name ?? "Alguien",
        listingTitle: listing.title,
        message: parsed.data.message,
        url,
      }),
    );
  }
  refresh();
  redirect(`/mensajes/${data.id}`);
}

const decisionSchema = z.object({ interestId: z.uuid(), decision: z.enum(["accepted", "declined", "withdrawn"]) });

export async function decideInterest(interestId: string, decision: "accepted" | "declined" | "withdrawn"): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = decisionSchema.safeParse({ interestId, decision });
  if (!parsed.success) return { status: "error", message: "Acción no válida." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interests")
    .update({ status: parsed.data.decision })
    .eq("id", parsed.data.interestId)
    .select("id, from_user, listing:listings!interests_listing_id_fkey(title, owner:profiles!listings_owner_id_fkey(display_name)), guest:profiles!interests_from_user_fkey(display_name)")
    .maybeSingle();
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data) return { status: "error", message: "Conversación no encontrada." };

  if (parsed.data.decision === "accepted") {
    const url = await conversationUrl(data.id);
    await emailUser(data.from_user, () =>
      interestAcceptedEmail({
        guestName: data.guest?.display_name ?? "",
        ownerName: data.listing?.owner?.display_name ?? "El anunciante",
        listingTitle: data.listing?.title ?? "",
        url,
      }),
    );
  }
  refresh(data.id);
  return { status: "success" };
}

// -----------------------------------------------------------------------------
// Mensajes
// -----------------------------------------------------------------------------

export type SentMessage = { id: string; sender_id: string; body: string; created_at: string };

export async function sendMessage(
  interestId: string,
  body: string,
): Promise<{ ok: true; message: SentMessage } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESSION_EXPIRED.message! };
  const parsed = chatMessageSchema.safeParse({ interestId, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Mensaje no válido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ interest_id: parsed.data.interestId, sender_id: user.id, body: parsed.data.body })
    .select("id, sender_id, body, created_at")
    .single();
  if (error || !data) return { ok: false, error: dbErrorMessage(error ?? { message: "" }) };
  revalidatePath("/mensajes");
  return { ok: true, message: data };
}

export async function markRead(interestId: string): Promise<void> {
  if (!z.uuid().safeParse(interestId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_interest_id: interestId });
}

// -----------------------------------------------------------------------------
// Estancias
// -----------------------------------------------------------------------------

export async function proposeStay(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = proposeStaySchema.safeParse({
    interestId: formData.get("interestId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: interest } = await supabase
    .from("interests")
    .select("id, from_user, listing:listings!interests_listing_id_fkey(id, title, owner_id)")
    .eq("id", parsed.data.interestId)
    .maybeSingle();
  if (!interest?.listing) return { status: "error", message: "Conversación no encontrada." };

  const { error } = await supabase.from("stays").insert({
    listing_id: interest.listing.id,
    interest_id: interest.id,
    host_id: interest.listing.owner_id,
    guest_id: interest.from_user,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate ?? null,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };

  const recipient = user.id === interest.from_user ? interest.listing.owner_id : interest.from_user;
  const { data: names } = await supabase.from("profiles").select("id, display_name").in("id", [user.id, recipient]);
  const nameOf = (id: string) => names?.find((n) => n.id === id)?.display_name ?? "";
  const url = await conversationUrl(interest.id);
  await emailUser(recipient, () =>
    stayProposedEmail({
      recipientName: nameOf(recipient),
      proposerName: nameOf(user.id),
      listingTitle: interest.listing!.title,
      startDate: formatShortDate(parsed.data.startDate),
      endDate: parsed.data.endDate ? formatShortDate(parsed.data.endDate) : null,
      url,
    }),
  );

  refresh(interest.id);
  return { status: "success", message: "Estancia propuesta. Falta que la otra parte la confirme." };
}

const stayIdSchema = z.uuid();
type StayRpc = "confirm_stay" | "cancel_stay" | "end_stay" | "confirm_stay_participation" | "decline_stay_participation";

/** Acciones de estancia: siempre por RPC (la BD valida la transición). */
export async function stayAction(stayId: string, action: StayRpc, interestId?: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!stayIdSchema.safeParse(stayId).success) return { status: "error", message: "Estancia no válida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc(action, { p_stay_id: stayId });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  refresh(interestId);
  return { status: "success" };
}

export async function addParticipant(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = participantSchema.safeParse({ stayId: formData.get("stayId"), profile: formData.get("profile") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_stay_participant", {
    p_stay_id: parsed.data.stayId,
    p_user_id: parsed.data.profile,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  const interestId = formData.get("interestId");
  refresh(typeof interestId === "string" ? interestId : undefined);
  return { status: "success", message: "Compañero/a añadido/a. Tiene que confirmar desde «Mis estancias»." };
}
