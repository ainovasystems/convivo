/**
 * Avisa a Sentry de un error que ha capturado una pantalla de error
 * (error.tsx / global-error.tsx). Si Sentry está apagado, no hace nada ni
 * descarga nada. Nunca lanza.
 */
export function reportClientError(error: unknown) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => undefined);
}
