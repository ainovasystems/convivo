import { DEPOSIT_RETURN_TEXT, depositGuideFor } from "@/lib/contracts/deposits";
import { formatEuros } from "@/lib/listings/options";

/**
 * Ayuda con la fianza (información orientativa). Solo la ve el casero, y
 * plegada: se despliega con el botón «¿Ayuda con la fianza?». Usa
 * <details>, así funciona sin JavaScript y con teclado.
 */
export function DepositGuide({ province, deposit }: { province: string | null; deposit: number }) {
  if (deposit <= 0) return null;
  const guide = depositGuideFor(province);

  return (
    <details className="group rounded-3xl border border-border p-5 text-sm print:hidden" data-testid="deposit-help">
      <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-brand px-4 py-2 font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        ¿Ayuda con la fianza?
      </summary>
      <div className="mt-4 space-y-2">
        <h2 className="font-bold">
          {guide.title} · {formatEuros(deposit)}
        </h2>
        {guide.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {guide.unconfirmed.length ? (
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {guide.unconfirmed.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        ) : null}
        <p>{DEPOSIT_RETURN_TEXT}</p>
        <p className="text-xs text-muted">
          {guide.notice}
          {guide.law ? ` Norma: ${guide.law}.` : ""}
          {guide.url ? (
            <>
              {" "}
              <a href={guide.url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                Fuente oficial
              </a>
            </>
          ) : null}
        </p>
      </div>
    </details>
  );
}
