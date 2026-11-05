"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * Acciones de moderación. La comprobación de admin se hace aquí y otra vez en
 * la BD (RLS de reports y delete_review), así que una llamada directa a la
 * API tampoco funcionaría sin ser admin.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  return isAdmin ? { user, supabase } : null;
}

const resolveSchema = z.object({
  reportId: z.uuid(),
  note: z.string().trim().min(5, { error: "Explica brevemente la decisión" }).max(1000),
});

export async function dismissReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { status: "error", message: "Solo administradores." };
  const parsed = resolveSchema.safeParse({ reportId: formData.get("reportId"), note: formData.get("note") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const { error } = await ctx.supabase
    .from("reports")
    .update({
      status: "dismissed",
      resolved_by: ctx.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: parsed.data.note,
    })
    .eq("id", parsed.data.reportId)
    .eq("status", "open");
  if (error) return { status: "error", message: "No se ha podido descartar la denuncia." };
  return { status: "success", message: "Denuncia descartada." };
}

const removeSchema = resolveSchema.extend({ reviewId: z.uuid() });

/** Elimina la reseña (queda constancia sin texto) y cierra sus denuncias abiertas. */
export async function removeReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { status: "error", message: "Solo administradores." };
  const parsed = removeSchema.safeParse({
    reportId: formData.get("reportId"),
    reviewId: formData.get("reviewId"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const reason = `Moderación: ${parsed.data.note}`.slice(0, 500);
  const { error } = await ctx.supabase.rpc("delete_review", {
    p_review_id: parsed.data.reviewId,
    p_reason: reason.length >= 10 ? reason : `${reason} (moderación)`,
  });
  if (error) return { status: "error", message: error.message };

  await ctx.supabase
    .from("reports")
    .update({
      status: "resolved",
      resolved_by: ctx.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: parsed.data.note,
    })
    .eq("target_review_id", parsed.data.reviewId)
    .eq("status", "open");
  return { status: "success", message: "Reseña eliminada y denuncias cerradas." };
}
