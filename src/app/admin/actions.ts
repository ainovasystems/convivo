"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getMailer } from "@/lib/email/mailer";
import { emailUser } from "@/lib/email/notify";
import { contentRemovedEmail, noticeDecisionEmail, withdrawalDecisionEmail } from "@/lib/email/templates";
import type { FormState } from "@/lib/forms";
import { WITHDRAWAL_REASON } from "@/lib/reviews/schema";
import { getSiteUrl } from "@/lib/site-url";
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
type AdminContext = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;

/**
 * Email con la decisión a quien pidió retirar su propia reseña (el aviso de la
 * app lo pone la base de datos al cerrar la solicitud). Nunca lanza.
 */
async function emailWithdrawalDecision(ctx: AdminContext, authorId: string, accepted: boolean, note: string) {
  const { data: p } = await ctx.supabase.from("profiles").select("display_name").eq("id", authorId).maybeSingle();
  const url = `${await getSiteUrl()}/mis-resenas`;
  await emailUser(authorId, () => withdrawalDecisionEmail({ name: p?.display_name ?? "", accepted, note, url }));
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

  const { data: closed, error } = await ctx.supabase
    .from("reports")
    .update({
      status: "dismissed",
      resolved_by: ctx.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: parsed.data.note,
    })
    .eq("id", parsed.data.reportId)
    .eq("status", "open")
    .select("reason, reporter_id");
  if (error) return { status: "error", message: "No se ha podido descartar la denuncia." };
  const withdrawal = closed?.find((r) => r.reason === WITHDRAWAL_REASON);
  if (withdrawal) {
    await emailWithdrawalDecision(ctx, withdrawal.reporter_id, false, parsed.data.note);
    return { status: "success", message: "Solicitud rechazada y comunicada. La reseña sigue como estaba." };
  }
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

  // ¿Hay una solicitud de retirada abierta del propio autor? Si el admin está
  // decidiendo ESA solicitud, la reseña se retira «a petición»; si actúa por la
  // denuncia de otra persona, es moderación. En los dos casos la solicitud se
  // cierra y el autor recibe la decisión.
  const { data: requests } = await ctx.supabase
    .from("reports")
    .select("id, reporter_id")
    .eq("target_review_id", parsed.data.reviewId)
    .eq("reason", WITHDRAWAL_REASON)
    .eq("status", "open")
    .limit(1);
  const requester = requests?.[0]?.reporter_id ?? null;
  const onRequest = requests?.[0]?.id === parsed.data.reportId;

  const reason = `${onRequest ? "Retirada a petición de quien la escribió" : "Moderación"}: ${parsed.data.note}`.slice(0, 500);
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
  if (requester) {
    await emailWithdrawalDecision(ctx, requester, true, parsed.data.note);
    return { status: "success", message: "Reseña retirada y decisión comunicada a quien la escribió." };
  }
  return { status: "success", message: "Reseña eliminada y denuncias cerradas." };
}

const flagSchema = z.object({
  flagId: z.uuid(),
  decision: z.enum(["dismiss", "close_listing"]),
  note: z.string().trim().min(5, { error: "Explica brevemente la decisión" }).max(1000),
});

/** Revisa una marca anti-fraude: descartarla o cerrar el anuncio. La BD deja constancia en moderation_log. */
export async function resolveListingFlag(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { status: "error", message: "Solo administradores." };
  const parsed = flagSchema.safeParse({
    flagId: formData.get("flagId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const { error } = await ctx.supabase.rpc("admin_resolve_listing_flag", {
    p_flag_id: parsed.data.flagId,
    p_action: parsed.data.decision,
    p_note: parsed.data.note,
  });
  if (error) return { status: "error", message: error.message };
  return {
    status: "success",
    message: parsed.data.decision === "dismiss" ? "Marca descartada." : "Anuncio cerrado.",
  };
}

const noticeDecisionSchema = z.object({
  noticeId: z.uuid(),
  decision: z.enum(["actioned", "rejected"]),
  note: z.string().trim().min(10, { error: "Motiva la decisión (mínimo 10 caracteres): se le enviará a quien notificó" }).max(2000),
  removeContent: z.literal("on").optional(),
});

/**
 * Decide una notificación del canal público (DSA arts. 16 y 17): opcionalmente
 * retira el contenido (cierra el anuncio o elimina la reseña), registra la
 * decisión motivada y la comunica a quien notificó y, si se retiró algo, a
 * quien lo publicó.
 */
export async function decideNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { status: "error", message: "Solo administradores." };
  const parsed = noticeDecisionSchema.safeParse({
    noticeId: formData.get("noticeId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
    removeContent: formData.get("removeContent") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const { noticeId, decision, note } = parsed.data;
  const remove = decision === "actioned" && parsed.data.removeContent === "on";

  const { data: notice } = await ctx.supabase
    .from("legal_notices")
    .select("id, reference, target_type, target_id, notifier_name, notifier_email, status")
    .eq("id", noticeId)
    .maybeSingle();
  if (!notice || notice.status !== "received") return { status: "error", message: "Notificación no encontrada o ya decidida." };

  let affected: { userId: string; what: string } | null = null;
  if (remove && notice.target_type === "listing" && notice.target_id) {
    const { data: l } = await ctx.supabase.from("listings").select("owner_id, title").eq("id", notice.target_id).maybeSingle();
    const { error } = await ctx.supabase.rpc("admin_close_listing", { p_listing_id: notice.target_id, p_note: note.slice(0, 1000) });
    if (error) return { status: "error", message: error.message };
    if (l) affected = { userId: l.owner_id, what: `tu anuncio «${l.title}»` };
  } else if (remove && notice.target_type === "review" && notice.target_id) {
    const { data: r } = await ctx.supabase.from("reviews").select("author_id").eq("id", notice.target_id).maybeSingle();
    const { error } = await ctx.supabase.rpc("delete_review", {
      p_review_id: notice.target_id,
      p_reason: `Moderación (ref. ${notice.reference}): ${note}`.slice(0, 500),
    });
    if (error) return { status: "error", message: error.message };
    if (r) affected = { userId: r.author_id, what: "una reseña tuya" };
    // Cierra las denuncias abiertas sobre esa reseña (también una solicitud de
    // retirada de su autor, que así no queda pendiente sobre algo ya retirado).
    await ctx.supabase
      .from("reports")
      .update({ status: "resolved", resolved_by: ctx.user.id, resolved_at: new Date().toISOString(), resolution_note: note.slice(0, 1000) })
      .eq("target_review_id", notice.target_id)
      .eq("status", "open");
  }

  const { error } = await ctx.supabase.rpc("admin_decide_legal_notice", { p_notice_id: noticeId, p_decision: decision, p_note: note });
  if (error) return { status: "error", message: error.message };

  const site = await getSiteUrl();
  try {
    await getMailer().send({
      to: notice.notifier_email,
      ...noticeDecisionEmail({ name: notice.notifier_name, reference: notice.reference, actioned: decision === "actioned", note, url: site }),
    });
  } catch (e) {
    console.error("[email] decisión de notificación", e);
  }
  if (affected) {
    const target = affected;
    const { data: p } = await ctx.supabase.from("profiles").select("display_name").eq("id", target.userId).maybeSingle();
    await emailUser(target.userId, () =>
      contentRemovedEmail({ name: p?.display_name ?? "", what: target.what, note, url: site }),
    );
  }
  return { status: "success", message: decision === "actioned" ? "Decisión registrada y comunicada." : "Notificación rechazada y comunicada." };
}
