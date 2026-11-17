import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { DepositTimeline } from "@/components/contracts/deposit-timeline";
import { PrintButton } from "@/components/contracts/print-button";
import { getCurrentUser } from "@/lib/auth";
import { getDepositView } from "@/lib/contracts/deposit-queries";
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_TRACKING_NOTICE,
  KEYS_UNCONFIRMED_LABEL,
  KEYS_UNCONFIRMED_NOTE,
  RETURN_DEADLINE_TEXT,
  addOneMonth,
  canDownloadEvidence,
  formatDay,
  keysAreConfirmed,
  madridToday,
} from "@/lib/contracts/deposit-tracking";
import { CONDITION_LABELS, INVENTORY_STAGES, STAGE_LABELS, compareWithEntry, groupByArea } from "@/lib/contracts/inventory";
import { getInventory } from "@/lib/contracts/inventory-queries";
import { getContract } from "@/lib/contracts/queries";
import { CONTRACT_KIND_LABELS, type ContractKind } from "@/lib/contracts/schema";
import { signatureLabel } from "@/lib/contracts/signature";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Paquete de pruebas de la fianza", robots: { index: false } };

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

/**
 * Paquete de pruebas para el inquilino cuando venció el plazo de devolución de
 * la fianza: datos del contrato y su huella, inventarios con fotos, fechas
 * clave y cronología. Se guarda como PDF con «Descargar o imprimir». Es
 * informativo: no es una carta de requerimiento ni una reclamación.
 */
export default async function DepositEvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/contratos/${id}/fianza/pruebas`);
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await getContract(id);
  if (!c || c.status !== "signed" || c.tenant_id !== user.id) notFound();

  const view = await getDepositView(c, false);
  const today = madridToday();
  if (!canDownloadEvidence(view.row, today)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:py-10">
        <Link href={`/contratos/${id}`} className="text-sm font-medium text-brand underline">
          ← Volver al contrato
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">Paquete de pruebas de la fianza</h1>
        <p className="rounded-2xl bg-surface p-4 text-muted">
          El paquete se puede preparar cuando ha vencido el plazo de un mes para devolver la fianza y esta no consta como devuelta. Si la fecha de entrega de llaves está
          sin confirmar por el casero, se puede preparar pasado un mes desde la fecha que declaraste y, como mínimo, 7 días después de haberla registrado aquí (para que el casero haya
          podido verla); el paquete dirá de forma expresa que la fecha no está confirmada.
        </p>
      </div>
    );
  }

  const [entry, exit] = await Promise.all(INVENTORY_STAGES.map((stage) => getInventory(id, stage)));
  const inventories = [entry, exit] as const;
  const terms = (c.terms ?? {}) as Record<string, unknown>;
  const { row, events } = view;
  const confirmed = keysAreConfirmed(row);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:py-10 print:max-w-none print:space-y-6 print:py-0">
      <div className="space-y-3 print:hidden">
        <Link href={`/contratos/${id}`} className="text-sm font-medium text-brand underline">
          ← Volver al contrato
        </Link>
        <PrintButton />
        <p className="text-sm text-muted">Pulsa el botón y elige «Guardar como PDF». Las fotos de los inventarios van incluidas.</p>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Paquete de pruebas · devolución de la fianza</h1>
        <p className="text-sm text-muted">
          Preparado el {dateTime.format(new Date())} por {c.tenant?.display_name}. {DEPOSIT_TRACKING_NOTICE}
        </p>
        <p className="text-sm text-muted">
          Este documento recoge lo registrado en Hommie. No es una carta de requerimiento ni una reclamación, y Hommie no actúa en nombre de ninguna de las partes.
        </p>
      </header>

      {!confirmed ? (
        <section role="note" className="space-y-1 break-inside-avoid rounded-2xl border-2 border-red-700 p-4 text-sm" data-testid="keys-unconfirmed-banner">
          <p className="font-bold text-red-800">
            Atención: la fecha de entrega de llaves NO fue confirmada por el casero.
          </p>
          <p>
            Es la fecha {row.keys_declared_on ? formatDay(row.keys_declared_on) : "—"}, declarada por el inquilino y registrada en Hommie el {when(row.keys_declared_at)}. {KEYS_UNCONFIRMED_NOTE} Este
            paquete se prepara porque ha pasado un mes desde esa fecha declarada.
          </p>
        </section>
      ) : null}

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">1. Datos del contrato</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-semibold">Tipo</dt>
          <dd>{CONTRACT_KIND_LABELS[c.kind as ContractKind]}</dd>
          <dt className="font-semibold">Vivienda</dt>
          <dd>{String(terms.address ?? "—")}</dd>
          <dt className="font-semibold">Parte arrendadora</dt>
          <dd>{String(terms.landlord_name ?? c.landlord?.display_name ?? "—")}</dd>
          <dt className="font-semibold">Parte arrendataria</dt>
          <dd>{String(terms.tenant_name ?? c.tenant?.display_name ?? "—")}</dd>
          <dt className="font-semibold">Renta mensual</dt>
          <dd>{formatMoney(Number(terms.monthly_rent ?? 0))}</dd>
          <dt className="font-semibold">Fianza</dt>
          <dd>{formatMoney(Number(terms.deposit ?? 0))}</dd>
          <dt className="font-semibold">Inicio / fin</dt>
          <dd>
            {terms.start_date ? formatDay(String(terms.start_date)) : "—"} / {terms.end_date ? formatDay(String(terms.end_date)) : "sin fecha de fin"}
          </dd>
          <dt className="font-semibold">Firma de la parte arrendadora</dt>
          <dd>{c.landlord_signed_at ? `${signatureLabel(c.landlord_signed_name, terms.landlord_name, c.landlord_signature)} · ${when(c.landlord_signed_at)}` : "—"}</dd>
          <dt className="font-semibold">Firma de la parte arrendataria</dt>
          <dd>{c.tenant_signed_at ? `${signatureLabel(c.tenant_signed_name, terms.tenant_name, c.tenant_signature)} · ${when(c.tenant_signed_at)}` : "—"}</dd>
          <dt className="font-semibold">Identificador del contrato</dt>
          <dd className="break-all">{c.id}</dd>
          <dt className="font-semibold">Huella del texto (SHA-256)</dt>
          <dd className="break-all">{c.document_hash}</dd>
        </dl>
      </section>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">2. Fechas clave de la fianza</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-semibold">Estado</dt>
          <dd>{DEPOSIT_STATUS_LABELS[row.status]}</dd>
          <dt className="font-semibold">Depósito anotado por el casero</dt>
          <dd>{row.deposited_on ? `${formatDay(row.deposited_on)} · resguardo n.º ${row.receipt_number}` : "No consta"}</dd>
          <dt className="font-semibold">Entrega de llaves</dt>
          <dd>{row.keys_declared_on ? formatDay(row.keys_declared_on) : "—"}</dd>
          <dt className="font-semibold">Declarada por el inquilino</dt>
          <dd>{when(row.keys_declared_at)}</dd>
          <dt className="font-semibold">Confirmación del casero</dt>
          <dd>
            {confirmed ? `Confirmada el ${when(row.keys_confirmed_at)}` : `NO CONFIRMADA. ${KEYS_UNCONFIRMED_LABEL}.`}
          </dd>
          <dt className="font-semibold">Fin del plazo de devolución</dt>
          <dd>
            {row.return_due_on
              ? formatDay(row.return_due_on)
              : row.keys_declared_on
                ? `Sin fecha confirmada. Un mes desde la fecha declarada: ${formatDay(addOneMonth(row.keys_declared_on))}`
                : "—"}
          </dd>
          <dt className="font-semibold">Fecha de este paquete</dt>
          <dd>{formatDay(today)}</dd>
        </dl>
        <p className="text-sm text-muted">{RETURN_DEADLINE_TEXT}</p>
      </section>

      {inventories.map((inv, i) => {
        const stage = INVENTORY_STAGES[i];
        const entryItems = entry?.items ?? [];
        const items = inv?.items ?? [];
        const flags = stage === "exit" ? compareWithEntry(items, entryItems) : [];
        const rows = items.map((it, k) => ({ ...it, newDamage: flags[k]?.newDamage ?? false }));
        return (
          <section key={stage} className="space-y-3">
            <h2 className="text-lg font-bold">
              {3 + i}. {STAGE_LABELS[stage]}
            </h2>
            {!inv ? (
              <p className="text-sm text-muted">No se hizo este inventario en Hommie.</p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Confirmado por la parte arrendadora el {when(inv.landlord_confirmed_at)} y por la arrendataria el {when(inv.tenant_confirmed_at)}
                  {inv.locked_at ? "; bloqueado, ya no se puede modificar." : "; todavía abierto."}
                </p>
                {groupByArea(rows).map((g) => (
                  <div key={g.area} className="space-y-2">
                    <h3 className="font-semibold">{g.area}</h3>
                    <ul className="space-y-3">
                      {g.items.map((it) => (
                        <li key={it.id} className="break-inside-avoid text-sm">
                          <p>
                            <strong>{it.name}</strong> · {CONDITION_LABELS[it.condition]}
                            {it.newDamage ? " · daño nuevo respecto a la entrada" : ""}
                          </p>
                          {it.notes ? <p className="text-muted">{it.notes}</p> : null}
                          {it.photos.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {it.photos.map((p, n) =>
                                p.url ? (
                                  <span key={p.path}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de un bucket privado */}
                                    <img src={p.url} alt={`${it.name}, foto ${n + 1}`} loading="eager" className="size-32 rounded-lg object-cover ring-1 ring-border print:size-36" />
                                  </span>
                                ) : null,
                              )}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </section>
        );
      })}

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-bold">5. Cronología de avisos y confirmaciones</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Sin registros.</p>
        ) : (
          <DepositTimeline events={events} when={when} className="space-y-1 text-sm" />
        )}
      </section>

      <p className="border-t border-border pt-3 text-xs text-muted">
        Borrador pendiente de revisión legal. Información registrada por las partes en Hommie; no constituye asesoramiento jurídico.
      </p>
    </div>
  );
}
