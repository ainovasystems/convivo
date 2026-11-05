"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { reportReviewSchema, responseSchema, reviewFormDataToObject, reviewSchema } from "@/lib/reviews/schema";
import { recordSignal } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";
import type { Database } from "@/types/database.types";

const SESSION_EXPIRED: FormState = { status: "error", message: "Tu sesión ha caducado. Vuelve a entrar." };

function dbErrorMessage(error: { message: string; code?: string }) {
  if (error.message.includes("reviews_unique")) return "Ya has reseñado a esta persona o inmueble en esta estancia.";
  if (error.message.includes("review_responses_pkey")) return "Ya respondiste a esta reseña. La respuesta no se puede cambiar.";
  if (error.message.includes("reports_one_open_per_review")) return "Ya denunciaste esta reseña. La estamos revisando.";
  if (error.code === "42501" || error.message.includes("row-level security")) return "No tienes permiso para hacer esto.";
  return /^[A-ZÁÉÍÓÚ¿¡]/.test(error.message) ? error.message : "No se ha podido completar la acción.";
}

export async function createReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = reviewSchema.safeParse(reviewFormDataToObject(formData));
  if (!parsed.success) return { status: "error", message: "Revisa los campos marcados.", errors: fieldErrors(parsed.error) };
  const r = parsed.data;

  const supabase = await createClient();
  // `relationship` y `published_at` son NOT NULL pero los calcula el trigger
  // private.reviews_before_insert; el cliente ni siquiera tiene permiso para
  // enviarlos. Por eso el tipo generado los pide y aquí se omiten a propósito.
  const row = {
    stay_id: r.stayId,
    author_id: user.id,
    subject_type: r.subjectType,
    subject_listing_id: r.subjectType === "listing" ? r.subjectId : null,
    subject_user_id: r.subjectType === "user" ? r.subjectId : null,
    rating: r.rating,
    criteria: r.criteria,
    body: r.body,
  } as unknown as Database["public"]["Tables"]["reviews"]["Insert"];
  const { data, error } = await supabase
    .from("reviews")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { status: "error", message: dbErrorMessage(error ?? { message: "" }) };

  await recordSignal();
  revalidatePath("/mis-resenas");
  if (r.subjectType === "user") revalidatePath(`/perfil/${r.subjectId}`);
  else revalidatePath(`/anuncios/${r.subjectId}`);
  redirect(`/mis-resenas?enviada=${data.id}`);
}

export async function respondToReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = responseSchema.safeParse({ reviewId: formData.get("reviewId"), body: formData.get("body") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("review_responses")
    .insert({ review_id: parsed.data.reviewId, author_id: user.id, body: parsed.data.body });
  if (error) return { status: "error", message: dbErrorMessage(error) };

  const path = formData.get("path");
  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
  return { status: "success", message: "Respuesta publicada." };
}

export async function reportReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  const parsed = reportReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    reason: formData.get("reason"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_review_id: parsed.data.reviewId,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };

  const path = formData.get("path");
  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
  return {
    status: "success",
    message:
      parsed.data.reason === "personal_data"
        ? "Gracias. La reseña queda oculta hasta que la revisemos."
        : "Gracias. Revisaremos la reseña; mientras tanto sigue visible.",
  };
}

export async function markNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/mis-resenas");
}

/** Borrar mi propia reseña con motivo (queda constancia). */
export async function deleteMyReview(reviewId: string, reason: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (!z.uuid().safeParse(reviewId).success) return { status: "error", message: "Reseña no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_review", { p_review_id: reviewId, p_reason: reason });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  revalidatePath("/mis-resenas");
  return { status: "success" };
}
