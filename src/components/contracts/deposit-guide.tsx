import { DEPOSIT_GUIDE_CHECKED, depositRuleFor } from "@/lib/contracts/deposits";
import { formatEuros } from "@/lib/listings/options";

/** Qué hacer con la fianza según la comunidad autónoma (información orientativa). */
export function DepositGuide({ province, deposit, isRoom }: { province: string | null; deposit: number; isRoom: boolean }) {
  const found = depositRuleFor(province);
  if (deposit <= 0) return null;

  let main: string;
  let extra: string | undefined;
  if (!found) {
    main = "Cada comunidad autónoma decide si la fianza se deposita en un organismo público y en qué plazo. Consulta la tuya.";
  } else {
    const { ccaa, rule } = found;
    if (rule.required === true) {
      if (isRoom && rule.rooms === "no") {
        main = `En ${ccaa}, en el alquiler de habitaciones no hace falta depositarla en ningún organismo.`;
      } else {
        main = `En ${ccaa}, la parte arrendadora la deposita en ${rule.organism}. Plazo: ${rule.deadline}.`;
        extra = rule.how;
        if (isRoom && rule.rooms === "unclear") {
          extra = `${extra ?? ""} No hemos podido confirmar si se aplica también a las habitaciones: pregúntalo en el organismo.`.trim();
        }
      }
      if (isRoom && rule.roomsNote) extra = `${extra ? `${extra} ` : ""}${rule.roomsNote}`;
    } else if (rule.required === false) {
      main = `En ${ccaa}, hoy no hay que depositar la fianza en ningún organismo. La guarda la parte arrendadora hasta el final del contrato.`;
      extra = rule.note;
    } else {
      main = `En ${ccaa} no hemos podido confirmar si hay que depositar la fianza.`;
      extra = rule.note;
    }
    if (rule.required === true && rule.note) extra = `${extra ? `${extra} ` : ""}${rule.note}`;
  }

  return (
    <section aria-label="Qué hacer con la fianza" className="space-y-2 rounded-3xl border border-border p-5 text-sm print:hidden">
      <h2 className="font-bold">Fianza: {formatEuros(deposit)}</h2>
      <p>{main}</p>
      {extra ? <p className="text-muted">{extra}</p> : null}
      <p>Al terminar, se devuelve en el plazo de un mes desde la entrega de llaves. Si se retrasa, genera el interés legal (art. 36.4 LAU).</p>
      <p className="text-xs text-muted">
        Información orientativa, revisada en {DEPOSIT_GUIDE_CHECKED} y pendiente de revisión legal. Compruébala en la web oficial antes de hacer el
        trámite.
        {found?.rule.law ? ` Norma: ${found.rule.law}.` : ""}
        {found?.rule.url ? (
          <>
            {" "}
            <a href={found.rule.url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
              Fuente oficial
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
