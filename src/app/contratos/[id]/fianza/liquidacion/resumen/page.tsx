import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PrintButton } from "@/components/contracts/print-button";
import { ElementCompare } from "@/components/contracts/settlement-element";
import { getCurrentUser } from "@/lib/auth";
import { getDepositView } from "@/lib/contracts/deposit-queries";
import { eventLabel } from "@/lib/contracts/deposit-tracking";
import { getContract } from "@/lib/contracts/queries";
import {
  SETTLEMENT_DISPUTE_NOTICE,
  SETTLEMENT_NOTICE,
  answeredTotals,
  settlementStatusLabel,
  settlementTotals,
} from "@/lib/contracts/settlement";
import { getSettlementView } from "@/lib/contracts/settlement-queries";
import { formatEuros } from "@/lib/listings/options";

export const metadata: Metadata = { title: "Resumen de la liquidación de la fianza", robots: { index: false } };

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

/**
 * Resumen imprimible a PDF de la liquidación: partidas, fotos de entrada y salida,
 * respuestas, fechas, estado y huella. Informativo: sin valor de sentencia ni de
 * arbitraje. Si no hay acuerdo, sirve como constancia.
 */
export default async function SettlementSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/contratos/${id}/fianza/liquidacion/resumen`);
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await getContract(id);
  if (!c || c.status !== "signed" || (c.landlord_id !== user.id && c.tenant_id !== user.id)) notFound();
  const view = await getSettlementView(id);
  if (!view || view.settlement.status === "draft") notFound();

  const depositView = await getDepositView(c, c.landlord_id === user.id);
  const { settlement: s, items } = view;
  const terms = (c.terms ?? {}) as Record<string, unknown>;
  const totals = settlementTotals(items, s.deposit_amount);
  const ans = answeredTotals(items);
  const events = depositView.events.filter((e) => e.kind.startsWith("settlement_"));
  const hash = s.final_hash ?? s.sent_hash;

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-6 sm:py-10 print:max-w-none print:space-y-5 print:py-0">
      <div className="space-y-3 print:hidden">
        <Link href={`/contratos/${id}/fianza/liquidacion`} className="text-sm font-medium text-brand underline">
          ← Volver a la liquidación
        </Link>
        <PrintButton />
        <p className="text-sm text-muted">Pulsa el botón y elige «Guardar como PDF». Las fotos van incluidas.</p>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Resumen · liquidación de la fianza</h1>
        <p className="text-sm text-muted">
          Preparado el {dateTime.format(new Date())}. {SETTLEMENT_NOTICE}
        </p>
        {s.status === "disputed" ? <p className="text-sm font-semibold">{SETTLEMENT_DISPUTE_NOTICE}</p> : null}
      </header>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">1. Estado y fechas</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[13rem_1fr]">
          <dt className="font-semibold">Estado</dt>
          <dd data-testid="summary-status">{settlementStatusLabel(s)}</dd>
          <dt className="font-semibold">Contrato</dt>
          <dd className="break-all">
            {String(terms.address ?? "—")} · {c.id}
          </dd>
          <dt className="font-semibold">Parte arrendadora</dt>
          <dd>{String(terms.landlord_name ?? c.landlord?.display_name ?? "—")}</dd>
          <dt className="font-semibold">Parte arrendataria</dt>
          <dd>{String(terms.tenant_name ?? c.tenant?.display_name ?? "—")}</dd>
          <dt className="font-semibold">Abierta</dt>
          <dd>{when(s.created_at)}</dd>
          <dt className="font-semibold">Enviada al inquilino</dt>
          <dd>{when(s.sent_at)}</dd>
          <dt className="font-semibold">Respondida por el inquilino</dt>
          <dd>{when(s.responded_at)}</dd>
          <dt className="font-semibold">Confirmada por el casero</dt>
          <dd>{when(s.landlord_confirmed_at)}</dd>
          <dt className="font-semibold">Confirmada por el inquilino</dt>
          <dd>{when(s.tenant_confirmed_at)}</dd>
          <dt className="font-semibold">Cerrada (bloqueada)</dt>
          <dd>{s.locked_at ? when(s.locked_at) : "No: todavía se puede modificar"}</dd>
        </dl>
      </section>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">2. Importes</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[13rem_1fr]">
          <dt className="font-semibold">Fianza</dt>
          <dd>{formatEuros(totals.deposit)}</dd>
          <dt className="font-semibold">Total de partidas</dt>
          <dd>{formatEuros(totals.total)}</dd>
          <dt className="font-semibold">Partidas aceptadas</dt>
          <dd>{formatEuros(ans.accepted)}</dd>
          <dt className="font-semibold">Partidas no aceptadas</dt>
          <dd>{formatEuros(ans.rejected)}</dd>
          <dt className="font-semibold">Importe devuelto (indicado por el casero)</dt>
          <dd>{depositView.row.returned_amount !== null ? formatEuros(depositView.row.returned_amount) : "No consta"}</dd>
        </dl>
        {totals.exceeds ? <p className="text-sm font-semibold">Los descuentos superan el importe de la fianza.</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. Partidas, fotos y respuestas</h2>
        {items.length === 0 ? <p className="text-sm text-muted">Sin partidas: no se descuenta nada de la fianza.</p> : null}
        <ol className="space-y-4">
          {items.map((i, n) => (
            <li key={i.id} className="space-y-2 break-inside-avoid text-sm">
              <p className="font-bold">
                {n + 1}. {i.concept} · {formatEuros(i.amount)}
              </p>
              {i.exit ? <ElementCompare entry={i.entry} exit={i.exit} /> : <p className="text-muted">Sin elemento del inventario.</p>}
              <p>
                Respuesta del inquilino:{" "}
                <strong>{i.tenant_response === "accepted" ? "Acepta" : i.tenant_response === "rejected" ? "NO acepta" : "Sin respuesta"}</strong>
                {i.tenant_comment ? ` — «${i.tenant_comment}»` : ""}
                {i.responded_at ? ` (${when(i.responded_at)})` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">4. Cronología</h2>
        <ol className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-muted">{when(e.created_at)}</span> · {eventLabel(e.kind, e.data)}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-1 break-inside-avoid text-sm">
        <h2 className="text-lg font-bold">5. Huella</h2>
        <p className="break-all">
          {s.final_hash ? "Huella SHA-256 del contenido final (partidas, respuestas y estado)" : "Huella SHA-256 de las partidas enviadas (aún sin cierre)"}: <strong>{hash}</strong>
        </p>
        {s.sent_hash && s.final_hash ? <p className="break-all text-muted">Huella de las partidas tal como se enviaron: {s.sent_hash}</p> : null}
      </section>

      <p className="border-t border-border pt-3 text-xs text-muted">
        Borrador pendiente de revisión legal. Información registrada por las partes en Hommie; no constituye asesoramiento jurídico ni tiene valor de sentencia o arbitraje.
      </p>
    </div>
  );
}
