import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { reviewWindowEmail } from "@/lib/email/templates";
import { emailUser } from "@/lib/email/notify";
import { getSentryDsn, REVIEW_WINDOWS_MONITOR } from "@/lib/monitoring/sentry-options";
import { formatDate } from "@/lib/reviews/labels";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tarea programada diaria (Vercel Cron, ver vercel.json): avisa por email e
 * in-app cuando se abre una ventana de reseña y 3 días antes de que se cierre.
 *
 * Uso acotado de service_role: lee review_window_notices_due() (función que
 * solo puede ejecutar service_role) y escribe notifications y
 * review_window_notices. Es idempotente: cada aviso se registra una vez.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Vercel Cron solo envía el secreto automáticamente si la variable se llama CRON_SECRET;
  // `cronsecret` se acepta para lanzarla a mano.
  const secret = process.env.CRON_SECRET ?? process.env.cronsecret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Con Sentry encendido, cada ejecución avisa de que empieza y de cómo acaba
  // (monitor «review-windows»): si un día no se ejecuta o falla, llega un email.
  if (!getSentryDsn()) return runReviewWindows(request);
  return Sentry.withMonitor(REVIEW_WINDOWS_MONITOR.slug, () => runReviewWindows(request), REVIEW_WINDOWS_MONITOR.config);
}

async function runReviewWindows(request: NextRequest) {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("review_window_notices_due");
  // Lanzar (y no solo responder 500) para que el monitor marque la ejecución como fallida.
  if (error) throw new Error(`review_window_notices_due: ${error.message}`);

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  let sent = 0;

  for (const n of due ?? []) {
    const kind = n.kind === "closing" ? "closing" : "opened";
    const closesAt = formatDate(n.closes_at);

    // Registrar primero el aviso: si algo falla después, no se repite en bucle.
    const { error: noticeError } = await admin
      .from("review_window_notices")
      .insert({ stay_id: n.stay_id, user_id: n.user_id, kind, opens_at: n.opens_at });
    if (noticeError) continue; // ya enviado por otra ejecución concurrente

    await admin.from("notifications").insert({
      user_id: n.user_id,
      kind: kind === "opened" ? "review_window_opened" : "review_window_closing",
      title:
        kind === "opened"
          ? `Ya puedes reseñar tu estancia en «${n.listing_title}»`
          : `Quedan 3 días para reseñar «${n.listing_title}»`,
      body: `Tienes hasta el ${closesAt}.`,
      url: "/mis-resenas",
    });

    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", n.user_id).single();
    await emailUser(n.user_id, () =>
      reviewWindowEmail({
        name: profile?.display_name ?? "",
        listingTitle: n.listing_title,
        kind,
        closesAt,
        url: `${site}/mis-resenas`,
      }),
    );
    sent++;
  }

  return NextResponse.json({ sent });
}
