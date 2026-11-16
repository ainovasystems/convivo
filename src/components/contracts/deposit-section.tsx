import Link from "next/link";
import type { ReactNode } from "react";

import { ConfirmKeysButton, DateActionForm, RecordDepositForm, RespondReturn } from "@/components/contracts/deposit-actions";
import { Chip } from "@/components/ui/chip";
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_TRACKING_NOTICE,
  KEYS_UNCONFIRMED_LABEL,
  KEYS_UNCONFIRMED_NOTE,
  RETURN_DEADLINE_TEXT,
  canDownloadEvidence,
  clockSentence,
  depositClock,
  eventLabel,
  formatDay,
  madridToday,
} from "@/lib/contracts/deposit-tracking";
import type { DepositView } from "@/lib/contracts/deposit-queries";
import { SETTLEMENT_NOTICE, settlementStatusLabel } from "@/lib/contracts/settlement";
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

        <Step
          n={2}
          title="Entrega de llaves"
          state={keysConfirmed ? "Confirmada por el casero" : keysDeclared ? KEYS_UNCONFIRMED_LABEL : "Sin declarar"}
        >
          {keysConfirmed && row.keys_declared_on ? (
            <p>
              Llaves entregadas el {formatDay(row.keys_declared_on)}, confirmadas por el casero
              {row.keys_confirmed_at ? ` el ${dateTime.format(new Date(row.keys_confirmed_at))}` : ""}.
            </p>
          ) : keysDeclared && row.keys_declared_on && row.keys_declared_at ? (
            <>
              <p>
                {isLandlord ? "Tu inquilino declara" : "Has declarado"} que se entregaron el {formatDay(row.keys_declared_on)}.{" "}
                <strong>{KEYS_UNCONFIRMED_LABEL}</strong>: registrada el {dateTime.format(new Date(row.keys_declared_at))}.
              </p>
              <p className="text-muted">{KEYS_UNCONFIRMED_NOTE}</p>
              {isLandlord ? (
                <>
                  <p className="text-muted">
                    Mientras no la confirmes te llegarán recordatorios en la app y por email. Si la fecha no es correcta, habladlo en la conversación: tu inquilino puede
                    corregirla mientras no la confirmes.
                  </p>
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
              hint={`Constará como declarada por ti hasta que ${otherName} la confirme. Convivo no la da por confirmada.`}
            />
          ) : (
            <p className="text-muted">Podrás declarar la entrega de llaves cuando la estancia haya terminado (se marca como terminada en la conversación).</p>
          )}
        </Step>

        <Step n={3} title="Plazo para devolver la fianza" state={clock.state === "overdue" ? "Vencido" : clock.state === "closing" ? "Se acerca" : clock.state === "unconfirmed" || clock.state === "unconfirmed_overdue" ? "Sin fecha confirmada" : undefined}>
          <p className={clock.state === "overdue" || clock.state === "unconfirmed_overdue" ? "font-semibold text-red-700" : undefined}>{clockSentence(clock)}</p>
          <p className="text-muted">{RETURN_DEADLINE_TEXT}</p>
        </Step>

        <Step n={4} title="Devolución" state={row.status === "returned" ? "Confirmada" : row.status === "claimed" ? "No recibida" : returnAwaitingTenant ? "Pendiente de confirmar" : undefined}>
          {row.status === "returned" && row.return_marked_on ? (
            <p>
              Devuelta el {formatDay(row.return_marked_on)}
              {row.returned_amount !== null ? <> · importe indicado por el casero: <strong>{formatEuros(row.returned_amount)}</strong></> : null} y confirmada por el inquilino. El registro ya
              no se puede cambiar.
            </p>
          ) : returnAwaitingTenant && row.return_marked_on ? (
            <>
              <p>
                El casero marcó la fianza como devuelta el {formatDay(row.return_marked_on)}
                {row.returned_amount !== null ? <> · importe indicado: <strong>{formatEuros(row.returned_amount)}</strong></> : null}.
              </p>
              {isLandlord ? <p className="text-muted">Falta que {otherName} confirme que la ha recibido.</p> : <RespondReturn contractId={contractId} />}
            </>
          ) : !keysConfirmed ? (
            <p className="text-muted">Se marca cuando la entrega de llaves esté confirmada.</p>
          ) : isLandlord ? (
            <>
              {row.status === "claimed" ? <p className="font-semibold text-red-700">{otherName} indica que no ha recibido la fianza. Cuando la hayas devuelto, vuelve a marcarla.</p> : null}
              <DateActionForm contractId={contractId} action="return" label="Fecha de devolución" button="Marcar como devuelta" today={today} min={row.keys_declared_on ?? undefined} withAmount />
            </>
          ) : (
            <p className="text-muted">
              {row.status === "claimed" ? "Has indicado que no la recibiste. Tu casero puede volver a marcarla cuando la devuelva." : "Cuando tu casero la devuelva, lo marcará aquí y tú lo confirmarás."}
            </p>
          )}
        </Step>


        <Step n={5} title="Liquidación de salida" state={view.settlement ? settlementStatusLabel(view.settlement) : undefined}>
          {view.settlement ? (
            <>
              <p className="text-muted">
                {view.settlement.locked_at
                  ? "Confirmada por las dos partes: ya no se puede cambiar."
                  : view.settlement.status === "draft"
                    ? isLandlord
                      ? "Está en preparación: añade las partidas y envíala."
                      : `${otherName} está preparando la liquidación.`
                    : view.settlement.status === "sent"
                      ? isLandlord
                        ? "Esperando la respuesta de tu inquilino."
                        : "Tienes que responder a cada partida."
                      : "Respondida: falta que las dos partes la confirmen."}
              </p>
              <Link href={`/contratos/${contractId}/fianza/liquidacion`} className="inline-block font-bold text-brand underline">
                {view.settlement.status === "draft" && !isLandlord ? "Ver el estado" : "Abrir la liquidación"}
              </Link>
            </>
          ) : view.exitLocked ? (
            isLandlord ? (
              <>
                <p className="text-muted">El inventario de salida está confirmado. Puedes abrir la liquidación para anotar, con el inventario delante, los descuentos que apliques.</p>
                <Link href={`/contratos/${contractId}/fianza/liquidacion`} className="inline-block font-bold text-brand underline">
                  Abrir la liquidación
                </Link>
              </>
            ) : (
              <p className="text-muted">Tu casero todavía no ha abierto la liquidación de la fianza.</p>
            )
          ) : (
            <p className="text-muted">Se abre cuando los dos hayáis confirmado el inventario de salida.</p>
          )}
          <p className="text-muted">{SETTLEMENT_NOTICE}</p>
        </Step>
      </ol>

      {evidence ? (
        <div className="space-y-2 rounded-2xl bg-brand-soft/40 p-4">
          <p className="font-semibold">
            {keysConfirmed ? "El plazo ha vencido y la fianza no consta como devuelta." : "Ha pasado un mes desde la fecha de llaves que declaraste y la fianza no consta como devuelta."}
          </p>
          {!keysConfirmed ? <p>Ojo: el casero no ha confirmado esa fecha, y el paquete lo indicará de forma expresa.</p> : null}
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
                <span className="text-muted">{dateTime.format(new Date(e.created_at))}</span> · {eventLabel(e.kind, e.data)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
