"use server";

import { createHmac, randomBytes } from "node:crypto";

import { getMailer } from "@/lib/email/mailer";
import { noticeReceivedEmail } from "@/lib/email/templates";
import type { FormState } from "@/lib/forms";
import { noticeSchema, parseNoticeTarget } from "@/lib/moderation/notices";
import { getClientIp, getSignalSecret } from "@/lib/signals";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

/** Huella para el límite de envíos. Sin SIGNAL_SECRET, una aleatoria (no limita, pero no rompe). */
function fingerprint(value: string) {
  const secret = getSignalSecret() ?? randomBytes(32).toString("hex");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function submitNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["url", "reviewId", "reason", "explanation", "name", "email", "goodFaith"].map((k) => [k, formData.get(k) ?? undefined]));
  const parsed = noticeSchema.safeParse(raw);
  const values = { url: String(raw.url ?? ""), name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error), values };

  const d = parsed.data;
  const target = parseNoticeTarget(d.url, d.reviewId);
  const supabase = await createClient();
  const { data: reference, error } = await supabase.rpc("submit_legal_notice", {
    p_target_type: target.type,
    // Para 'other' va null: los tipos generados no marcan el parámetro como opcional.
    p_target_id: target.id as string,
    p_target_url: d.url,
    p_reason: d.reason,
    p_explanation: d.explanation,
    p_notifier_name: d.name,
    p_notifier_email: d.email,
    p_good_faith: true,
    p_ip_hash: fingerprint(await getClientIp()),
    p_email_hash: fingerprint(d.email.toLowerCase()),
  });
  if (error || !reference) {
    const message =
      error?.code === "P0429" || error?.code === "P0002"
        ? error.message
        : "No hemos podido registrar la notificación. Inténtalo de nuevo.";
    return { status: "error", message, values };
  }

  // Acuse de recibo por email (art. 16.4). Un fallo de email no anula el registro.
  try {
    await getMailer().send({ to: d.email, ...noticeReceivedEmail({ name: d.name, reference, url: `${await getSiteUrl()}/denunciar` }) });
  } catch (e) {
    console.error("[email] acuse de notificación", e);
  }
  return {
    status: "success",
    message: `Recibida. Tu referencia es ${reference}. Te hemos enviado un acuse por email; la revisaremos en un máximo de 72 horas y te contaremos la decisión.`,
  };
}
