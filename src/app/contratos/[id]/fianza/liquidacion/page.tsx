import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  AddItemForm,
  ConfirmSettlementButton,
  DeleteItemButton,
  OpenSettlementButton,
  ReopenButton,
  RespondForm,
  SendSettlementButton,
} from "@/components/contracts/settlement-actions";
import { ElementCompare } from "@/components/contracts/settlement-element";
import { Chip } from "@/components/ui/chip";
import { getCurrentUser } from "@/lib/auth";
import { getDepositView } from "@/lib/contracts/deposit-queries";
import { eventLabel } from "@/lib/contracts/deposit-tracking";
import { CONDITION_LABELS } from "@/lib/contracts/inventory";
import { getContract } from "@/lib/contracts/queries";
import {
  SETTLEMENT_DISPUTE_NOTICE,
  SETTLEMENT_MAX_ITEMS,
  SETTLEMENT_NOTICE,
  WEAR_NOTICE,
  settlementStatusLabel,
  settlementTotals,
} from "@/lib/contracts/settlement";
import { getSettlementView } from "@/lib/contracts/settlement-queries";
import { formatEuros } from "@/lib/listings/options";

export const metadata: Metadata = { title: "Liquidación de la fianza", robots: { index: false } };

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

/**
 * Liquidación de salida de la fianza. Hommie solo documenta: el casero anota las
 * partidas (con los daños nuevos del inventario), el inquilino responde a cada
 * una y las dos partes confirman. Confirmada, queda bloqueada.
 */
export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/contratos/${id}/fianza/liquidacion`);
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await getContract(id);
  if (!c || c.status !== "signed") notFound();
  const isLandlord = c.landlord_id === user.id;
  const isTenant = c.tenant_id === user.id;
  if (!isLandlord && !isTenant) notFound();
  const terms = (c.terms ?? {}) as Record<string, unknown>;
  const deposit = Number(terms.deposit ?? 0);
  if (deposit <= 0) notFound();

  const [view, depositView] = await Promise.all([getSettlementView(id), getDepositView(c, isLandlord)]);
  const otherName = (isLandlord ? c.tenant?.display_name : c.landlord?.display_name) ?? "La otra parte";
  const back = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <Link href={`/contratos/${id}#fianza`} className="text-sm font-medium text-brand underline">
        ← Volver al contrato
      </Link>
      {c.interest_id ? (
        <Link href={`/mensajes/${c.interest_id}`} className="text-sm font-semibold text-brand underline">
          Hablarlo en la conversación
        </Link>
      ) : null}
    </div>
  );

  if (!view) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        {back}
        <h1 className="text-2xl font-extrabold tracking-tight">Liquidación de la fianza</h1>
        <p className="text-sm text-muted">{SETTLEMENT_NOTICE}</p>
        {isLandlord && depositView.exitLocked ? (
          <div className="space-y-3 rounded-2xl border border-border p-4">
            <p>
              El inventario de salida está confirmado por los dos. Abre la liquidación para anotar los descuentos de la fianza ({formatEuros(deposit)}) con el inventario delante.
            </p>
            <OpenSettlementButton contractId={id} />
          </div>
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-muted">
            {depositView.exitLocked
              ? `${otherName} todavía no ha abierto la liquidación.`
              : "La liquidación se abre cuando los dos hayáis confirmado el inventario de salida."}
          </p>
        )}
      </div>
    );
  }

  const { settlement: s, items, candidates, wear } = view;
  const totals = settlementTotals(items, s.deposit_amount);
  const locked = Boolean(s.locked_at);
  const draft = s.status === "draft";
  const answered = s.status === "agreed" || s.status === "disputed";
  const myConfirmed = isLandlord ? s.landlord_confirmed_at : s.tenant_confirmed_at;
  const theirConfirmed = isLandlord ? s.tenant_confirmed_at : s.landlord_confirmed_at;
  const events = depositView.events.filter((e) => e.kind.startsWith("settlement_"));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-10">
      {back}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Liquidación de la fianza</h1>
        <Chip tone={locked && s.status === "agreed" ? "success" : "neutral"}>{settlementStatusLabel(s)}</Chip>
      </div>
      <p className="text-sm text-muted">{SETTLEMENT_NOTICE}</p>

      <section aria-label="Total" className="space-y-1 rounded-2xl bg-surface p-4" data-testid="settlement-totals">
        <p>
          Fianza: <strong>{formatEuros(totals.deposit)}</strong> · Total de descuentos: <strong>{formatEuros(totals.total)}</strong>
        </p>
        <p className="text-sm text-muted">Resultado si se aplicaran todas las partidas: {formatEuros(totals.remaining)} a devolver.</p>
        {totals.exceeds ? (
          <p role="status" className="text-sm font-semibold text-red-700">
            Los descuentos superan el importe de la fianza. Hommie solo lo señala; no decide nada.
          </p>
        ) : null}
      </section>

      <section aria-label="Partidas" className="space-y-3">
        <h2 className="text-lg font-bold">Partidas ({items.length})</h2>
        {items.length === 0 ? <p className="text-muted">{draft ? "Todavía no hay partidas." : "Sin partidas: no se descuenta nada de la fianza."}</p> : null}
        <ol className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="space-y-2 rounded-2xl border border-border p-4" data-testid="settlement-item">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">{i.concept}</p>
                <p className="font-bold">{formatEuros(i.amount)}</p>
              </div>
              {i.exit ? (
                <>
                  <p className="text-sm text-muted">
                    Elemento del inventario: {i.exit.area} · {i.exit.name} (daño nuevo: a la entrada «{i.entry ? CONDITION_LABELS[i.entry.condition] : "—"}», a la salida «{CONDITION_LABELS[i.exit.condition]}»)
                  </p>
                  <ElementCompare entry={i.entry} exit={i.exit} />
                </>
              ) : null}
              {i.tenant_response ? (
                <p className={"text-sm " + (i.tenant_response === "rejected" ? "font-semibold text-red-700" : "text-emerald-800")}>
                  {i.tenant_response === "accepted" ? "El inquilino acepta" : "El inquilino NO acepta"}
                  {i.tenant_comment ? `: «${i.tenant_comment}»` : "."} <span className="font-normal text-muted">({when(i.responded_at)})</span>
                </p>
              ) : null}
              {draft && isLandlord ? <DeleteItemButton itemId={i.id} concept={i.concept} /> : null}
            </li>
          ))}
        </ol>
      </section>

      {draft && isLandlord ? (
        <section aria-label="Preparar la liquidación" className="space-y-4">
          {items.length < SETTLEMENT_MAX_ITEMS ? (
            <AddItemForm settlementId={s.id} candidates={candidates.map((x) => ({ id: x.exit.id, label: `${x.exit.area} · ${x.exit.name}` }))} />
          ) : null}
          {candidates.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-border p-4 text-sm">
              <h3 className="font-bold">Daños nuevos detectados entre la entrada y la salida ({candidates.length})</h3>
              <p className="text-muted">Son los únicos elementos que se pueden vincular a una partida. Decides tú si hay partida y de cuánto.</p>
              {candidates.map((x) => (
                <div key={x.exit.id} className="space-y-1">
                  <p className="font-semibold">
                    {x.exit.area} · {x.exit.name}
                  </p>
                  <ElementCompare entry={x.entry} exit={x.exit} />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted">No hay daños nuevos sin partida entre el inventario de entrada y el de salida.</p>
          )}
          {wear.length > 0 ? (
            <div role="note" className="space-y-1 rounded-2xl border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950" data-testid="wear-notice">
              <p className="font-bold">Desgaste por uso normal: no descontable ({wear.length})</p>
              <p>{WEAR_NOTICE}</p>
              <ul className="list-inside list-disc">
                {wear.map((w) => (
                  <li key={w.id}>
                    {w.area} · {w.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">{WEAR_NOTICE}</p>
          )}
          <SendSettlementButton contractId={id} settlementId={s.id} items={items.length} />
        </section>
      ) : null}

      {s.status === "sent" && isTenant ? (
        <RespondForm
          contractId={id}
          settlementId={s.id}
          items={items.map((i) => ({ id: i.id, concept: i.concept, amountLabel: formatEuros(i.amount), response: null, comment: null }))}
        />
      ) : null}
      {s.status === "sent" && isLandlord ? <p className="rounded-2xl bg-surface p-4 text-muted">Enviada el {when(s.sent_at)}. Esperando la respuesta de {otherName}.</p> : null}
      {draft && isTenant ? <p className="rounded-2xl bg-surface p-4 text-muted">{otherName} está preparando la liquidación. Te avisaremos cuando te la envíe.</p> : null}

      {answered && !locked ? (
        <section aria-label="Confirmación" className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-lg font-bold">Confirmación</h2>
          <p className="text-sm">
            {s.status === "agreed" ? "El inquilino acepta todas las partidas." : "El inquilino no acepta alguna partida."} Respondida el {when(s.responded_at)}.
          </p>
          {s.status === "disputed" ? <p className="text-sm text-muted">{SETTLEMENT_DISPUTE_NOTICE}</p> : null}
          <p className="text-sm text-muted">
            Casero: {s.landlord_confirmed_at ? `confirmada el ${when(s.landlord_confirmed_at)}` : "pendiente"} · Inquilino:{" "}
            {s.tenant_confirmed_at ? `confirmada el ${when(s.tenant_confirmed_at)}` : "pendiente"}
          </p>
          {!myConfirmed ? (
            <ConfirmSettlementButton contractId={id} settlementId={s.id} disputed={s.status === "disputed"} />
          ) : (
            <p className="text-sm font-semibold">Tú ya la has confirmado.{theirConfirmed ? "" : ` Falta ${otherName}.`}</p>
          )}
          {isTenant ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Cambiar mis respuestas</summary>
              <div className="mt-3">
                <RespondForm
                  contractId={id}
                  settlementId={s.id}
                  items={items.map((i) => ({ id: i.id, concept: i.concept, amountLabel: formatEuros(i.amount), response: i.tenant_response, comment: i.tenant_comment }))}
                />
                <p className="mt-2 text-muted">Si las cambias, se anulan las confirmaciones y hay que volver a confirmar.</p>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {!draft && !locked && isLandlord ? <ReopenButton contractId={id} settlementId={s.id} /> : null}

      {locked ? (
        <section aria-label="Cerrada" className="space-y-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
          <p className="font-bold">Confirmada por las dos partes el {when(s.locked_at)}: la liquidación ya no se puede cambiar.</p>
          {s.status === "disputed" ? <p>{SETTLEMENT_DISPUTE_NOTICE}</p> : null}
        </section>
      ) : null}

      {!draft ? (
        <Link href={`/contratos/${id}/fianza/liquidacion/resumen`} className="inline-block font-bold text-brand underline">
          Ver el resumen para descargar o imprimir (PDF)
        </Link>
      ) : null}

      {events.length > 0 ? (
        <details className="rounded-2xl border border-border p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Cronología de la liquidación ({events.length})</summary>
          <ul className="mt-3 space-y-1">
            {events.map((e) => (
              <li key={e.id}>
                <span className="text-muted">{when(e.created_at)}</span> · {eventLabel(e.kind, e.data)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
