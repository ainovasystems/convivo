/**
 * Arranque de Sentry en el servidor (Node) y en el middleware (Edge). Next.js
 * llama a register() una vez por instancia. Sin DSN no se carga nada.
 * Ver src/lib/monitoring/sentry-options.ts y docs/DEPLOY.md → Sentry.
 */
import * as Sentry from "@sentry/nextjs";

import { buildSentryOptions } from "@/lib/monitoring/sentry-options";

export async function register() {
  const options = buildSentryOptions(process.env.NEXT_RUNTIME === "edge" ? "edge" : "node");
  if (options) Sentry.init(options);
}

/** Errores de las páginas, Server Actions y rutas del servidor (no hace nada si Sentry está apagado). */
export const onRequestError = Sentry.captureRequestError;
