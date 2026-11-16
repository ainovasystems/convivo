import Link from "next/link";
import type { ReactNode } from "react";

import { ConfirmKeysButton, DateActionForm, RecordDepositForm, RespondReturn } from "@/components/contracts/deposit-actions";
import { Chip } from "@/components/ui/chip";
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_TRACKING_NOTICE,
  EVENT_LABELS,
  RETURN_DEADLINE_TEXT,
  canDownloadEvidence,
  clockSentence,
  depositClock,
  formatDay,
  keysAutoConfirmDay,
  madridToday,
} from "@/lib/contracts/deposit-tracking";
import type { DepositView } from "@/lib/contracts/deposit-queries";
import { formatEuros } from "@/lib/listings/options";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

function Step({ n, title, state, children }: { n: number; title: string; state?: ReactNode; children?: ReactNode }) {
  return (
    <li className="space-y-2 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">
          {n}. {title}
        </h3>
        {state ? <span className="text-sm font-semibold">{state}</span> : null}
      </div>
      {children}
    </li>
  );
}

/**
 * Apartado «Fianza» de un contrato firmado: estado, fechas y reloj del plazo de
 * devolución para las dos partes. Convivo no mueve dinero, solo deja constancia.
 */
export function DepositSection({
  contractId,
  deposit,
  view,
  isLandlord,
  roomKind,
  isGalicia,
  otherName,
}: {
  contractId: string;
  deposit: number;
  view: DepositView;
  isLandlord: boolean;
  roomKind: boolean;
  isGalicia: boolean;
  otherName: string;
}) {
  if (deposit <= 0) {
    return (
      <section id="fianza" aria-label="Fianza" className="space-y-2 rounded-3xl border border-border p-5 text-sm print:hidden">
        <h2 className="text-lg font-bold">Fianza</h2>
        <p className="text-muted">Este contrato no tiene fianza, así que no hay nada que seguir.</p>
      </section>
    );
  }

  const { row } = view;
  const today = madridToday();
  const clock = depositClock(row, today);
  const keysDeclared = Boolean(row.keys_declared_at);
  const keysConfirmed = Boolean(row.keys_confirmed_at);
  const returnAwaitingTenant = Boolean(row.return_marked_at) && !row.return_response;
  const evidence = !isLandlord && canDownloadEvidence(row, today);

  return (
    <section id="fianza" aria-label="Fianza" className="space-y-5 rounded-3xl border border-border p-5 text-sm print:hidden" data-testid="deposit-section">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">
          Fianza · {formatEuros(deposit)}
        </h2>
        <Chip tone={row.status === "returned" ? "success" : "neutral"}>{DEPOSIT_STATUS_LABELS[row.status]}</Chip>
      </div>
      <p className="text-muted">{DEPOSIT_TRACKING_NOTICE}</p>

      <ol className="space-y-3">
        <Step n={1} title="Depósito de la fianza" state={row.deposited_on ? "Depositada" : "Pendiente"}>
          {row.deposited_on ? (
            <>
              <p>
                Depositada el {formatDay(row.deposited_on)} · resguardo n.º <strong>{row.receipt_number}</strong>
              </p>
              {isLandlord ? (
                view.receiptUrl ? (
                  <a href={view.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Ver mi resguardo
                  </a>
                ) : (
                  <p className="text-muted">No has subido el documento. Solo lo verías tú.</p>
                )
              ) : null}
            </>
          ) : isLandlord ? (
            <>
              <p className="text-muted">
                {isGalicia
                  ? "Si tu comunidad lo exige, la fianza se deposita en el organismo de vivienda; en Galicia, consulta al IGVS cómo hacerlo."
                  : "Si tu comunidad lo exige, la fianza se deposita en su organismo de vivienda. Consúltalo allí."}
                {roomKind ? " En las habitaciones, no hemos confirmado que la obligación de depositar se aplique." : ""} Cuando lo hagas, anótalo aquí.
              </p>
              <RecordDepositForm contractId={contractId} today={today} />
            </>
          ) : (
            <p className="text-muted">{otherName} todavía no ha anotado el depósito (solo es necesario si tu comunidad lo exige).</p>
          )}
        </Step>

        <Step n={2} title="Entrega de llaves" state={keysConfirmed ? (row.keys_confirmation === "auto" ? "Dada por confirmada" : "Confirmada") : keysDeclared ? "Pendiente de confirmar" : "Sin declarar"}>
          {keysConfirmed && row.keys_declared_on ? (
            <p>
              Llaves entregadas el {formatDay(row.keys_declared_on)}.
              {row.keys_confirmation === "auto" ? " Se dio por confirmada porque el casero no respondió en 7 días; ha quedado constancia." : ""}
            </p>
          ) : keysDeclared && row.keys_declared_on && row.keys_declared_at ? (
            <>
              <p>
                {isLandlord ? "Tu inquilino declara" : "Has declarado"} que se entregaron el {formatDay(row.keys_declared_on)}. Si el casero no responde, se dará por confirmada el{" "}
                {formatDay(keysAutoConfirmDay(row.keys_declared_at))}.
              </p>
              {isLandlord ? (
                <>
                  <p className="text-muted">Si la fecha no es correcta, habladlo en la conversación: tu inquilino puede corregirla mientras no la confirmes.</p>
                  <ConfirmKeysButton contractId={contractId} />
                </>
              ) : (
                <DateActionForm contractId={contractId} action="keys" label="Corregir la fecha de entrega" button="Guardar la nueva fecha" today={today} />
              )}
            </>
          ) : isLandlord ? (
            <p className="text-muted">Cuando termine la estancia, {otherName} declarará aquí la fecha de entrega de llaves y tú la confirmarás.</p>
          ) : view.canDeclareKeys ? (
            <DateActionForm
              contractId={contractId}
              action="keys"
              label="Fecha de entrega de llaves"
              button="Declarar la entrega de llaves"
              today={today}
              hint={`${otherName} tiene 7 días para confirmarla; si no responde, se dará por confirmada.`}
            />
          ) : (
            <p className="text-muted">Podrás declarar la entrega de llaves cuando la estancia haya terminado (se marca como terminada en la conversación).</p>
          )}
        </Step>

        <Step n={3} title="Plazo para devolver la fianza" state={clock.state === "overdue" ? "Vencido" : clock.state === "closing" ? "Se acerca" : undefined}>
          <p className={clock.state === "overdue" ? "font-semibold text-red-700" : undefined}>{clockSentence(clock)}</p>
          <p className="text-muted">{RETURN_DEADLINE_TEXT}</p>
        </Step>

        <Step n={4} title="Devolución" state={row.status === "returned" ? "Confirmada" : row.status === "claimed" ? "No recibida" : returnAwaitingTenant ? "Pendiente de confirmar" : undefined}>
          {row.status === "returned" && row.return_marked_on ? (
            <p>Devuelta el {formatDay(row.return_marked_on)} y confirmada por el inquilino. El registro ya no se puede cambiar.</p>
          ) : returnAwaitingTenant && row.return_marked_on ? (
            <>
              <p>El casero marcó la fianza como devuelta el {formatDay(row.return_marked_on)}.</p>
              {isLandlord ? <p className="text-muted">Falta que {otherName} confirme que la ha recibido.</p> : <RespondReturn contractId={contractId} />}
            </>
          ) : !keysConfirmed ? (
            <p className="text-muted">Se marca cuando la entrega de llaves esté confirmada.</p>
          ) : isLandlord ? (
            <>
              {row.status === "claimed" ? <p className="font-semibold text-red-700">{otherName} indica que no ha recibido la fianza. Cuando la hayas devuelto, vuelve a marcarla.</p> : null}
              <DateActionForm contractId={contractId} action="return" label="Fecha de devolución" button="Marcar como devuelta" today={today} min={row.keys_declared_on ?? undefined} />
            </>
          ) : (
            <p className="text-muted">
              {row.status === "claimed" ? "Has indicado que no la recibiste. Tu casero puede volver a marcarla cuando la devuelva." : "Cuando tu casero la devuelva, lo marcará aquí y tú lo confirmarás."}
            </p>
          )}
        </Step>
      </ol>

      {evidence ? (
        <div className="space-y-2 rounded-2xl bg-brand-soft/40 p-4">
          <p className="font-semibold">El plazo ha vencido y la fianza no consta como devuelta.</p>
          <p>
            Puedes descargar un paquete de pruebas en PDF con los datos del contrato, los inventarios con fotos, las fechas clave y la cronología. Convivo no hace
            ninguna reclamación en tu nombre.
          </p>
          <Link href={`/contratos/${contractId}/fianza/pruebas`} className="inline-block font-bold text-brand underline">
            Preparar el paquete de pruebas
          </Link>
        </div>
      ) : null}

      {view.events.length > 0 ? (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Cronología ({view.events.length})</summary>
          <ul className="mt-3 space-y-1">
            {view.events.map((e) => (
              <li key={e.id}>
                <span className="text-muted">{dateTime.format(new Date(e.created_at))}</span> · {EVENT_LABELS[e.kind] ?? e.kind}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
