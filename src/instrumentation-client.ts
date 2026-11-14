/**
 * Arranque de Sentry en el navegador. Sin DSN no se descarga ni se inicializa
 * nada (cero JavaScript de más para quien visita) y la CSP no deja conectar con
 * Sentry. Con DSN se carga aparte, sin retrasar la página. Sin grabación de
 * sesiones: no se añade Replay. Ver src/lib/monitoring/sentry-options.ts.
 */
import { buildSentryOptions } from "@/lib/monitoring/sentry-options";

const options = buildSentryOptions("browser", {
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  NODE_ENV: process.env.NODE_ENV,
});

if (options) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(options));
}
