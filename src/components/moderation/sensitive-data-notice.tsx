import { SENSITIVE_DATA_NOTICE } from "@/lib/moderation/personal-data";

/** Aviso breve y visible bajo los textos públicos (reseña, respuesta y biografía). */
export function SensitiveDataNotice() {
  return (
    <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-muted" data-testid="sensitive-data-notice">
      {SENSITIVE_DATA_NOTICE}
    </p>
  );
}
