import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ContractEditor } from "@/components/contracts/contract-editor";
import { ContractSign } from "@/components/contracts/contract-sign";
import { ContractText } from "@/components/contracts/contract-text";
import { DepositGuide } from "@/components/contracts/deposit-guide";
import { PrintButton } from "@/components/contracts/print-button";
import { getCurrentUser } from "@/lib/auth";
import { STAGE_LABELS, STAGE_SLUGS, INVENTORY_STAGES } from "@/lib/contracts/inventory";
import { listContractInventories } from "@/lib/contracts/inventory-queries";
import { getContract } from "@/lib/contracts/queries";
import { CONTRACT_KIND_LABELS, type ContractKind } from "@/lib/contracts/schema";

export const metadata: Metadata = { title: "Contrato", robots: { index: false } };

const STATUS_LABELS = { draft: "Borrador", sent: "Pendiente de firma", signed: "Firmado", cancelled: "Cancelado" } as const;
const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/contratos/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await getContract(id);
  if (!c) notFound();

  const isLandlord = c.landlord_id === user.id;
  const terms = (c.terms ?? {}) as Record<string, unknown>;
  const myName = String((isLandlord ? terms.landlord_name : terms.tenant_name) ?? "");
  const iSigned = Boolean(isLandlord ? c.landlord_signed_at : c.tenant_signed_at);
  const inventories = c.status === "signed" ? await listContractInventories(c.id) : [];
  const entryLocked = inventories.some((i) => i.stage === "entry" && i.locked_at);
  const inventoryStatus = (stage: (typeof INVENTORY_STAGES)[number]) => {
    const inv = inventories.find((i) => i.stage === stage);
    if (!inv) return stage === "exit" && !entryLocked ? "Disponible tras confirmar la entrada" : "Sin empezar";
    if (inv.locked_at) return "Confirmado por los dos";
    const mine = isLandlord ? inv.landlord_confirmed_at : inv.tenant_confirmed_at;
    const theirs = isLandlord ? inv.tenant_confirmed_at : inv.landlord_confirmed_at;
    return mine ? "Falta la otra parte" : theirs ? "Te toca confirmarlo" : "En curso";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3 print:hidden">
        <div>
          <Link href="/contratos" className="text-sm font-medium text-brand underline">
            ← Mis contratos
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
            Contrato · {c.listing?.title ?? "anuncio cerrado"}
          </h1>
          <p className="text-sm text-muted">
            {CONTRACT_KIND_LABELS[c.kind as ContractKind]} · entre {c.landlord?.display_name} y {c.tenant?.display_name} ·{" "}
            <strong>{STATUS_LABELS[c.status]}</strong>
          </p>
        </div>
        {c.interest_id ? (
          <Link href={`/mensajes/${c.interest_id}`} className="text-sm font-semibold text-brand underline">
            Ir a la conversación
          </Link>
        ) : null}
      </div>

      {c.status === "draft" && isLandlord ? (
        <ContractEditor
          contractId={c.id}
          listingKind={c.kind === "room" ? "room" : "flat"}
          initialKind={c.kind as ContractKind}
          initialTerms={terms}
          meta={{ city: c.listing?.city ?? null, landlordId: c.landlord_id, tenantId: c.tenant_id }}
        />
      ) : c.status === "draft" ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">
          {c.landlord?.display_name} está preparando el contrato. Te avisaremos cuando esté listo para firmar.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <ContractText text={c.document_text ?? ""} />
          <aside className="space-y-4">
            {c.status === "sent" ? (
              <ContractSign contractId={c.id} hash={c.document_hash ?? ""} expectedName={myName} canSign={!iSigned} />
            ) : null}
            {c.status === "signed" ? (
              <div className="space-y-3 rounded-3xl bg-emerald-50 p-5 text-emerald-950 ring-1 ring-emerald-200 print:hidden">
                <p className="font-bold">Firmado por las dos partes.</p>
                <p className="text-sm">La estancia ha quedado confirmada. Cuando llegue el momento, podréis dejar vuestras reseñas.</p>
                <PrintButton />
              </div>
            ) : null}
            {c.status === "signed" ? (
              <section aria-label="Inventario" className="space-y-3 rounded-3xl border border-border p-5 text-sm print:hidden">
                <h2 className="font-bold">Inventario con fotos</h2>
                <p className="text-muted">Anotad juntos el estado de la vivienda al entrar y al salir. Sirve para devolver la fianza sin discusiones.</p>
                <ul className="space-y-2">
                  {INVENTORY_STAGES.map((stage) => (
                    <li key={stage}>
                      <Link href={`/contratos/${c.id}/inventario/${STAGE_SLUGS[stage]}`} className="font-semibold text-brand underline">
                        {STAGE_LABELS[stage]}
                      </Link>{" "}
                      <span className="text-muted">· {inventoryStatus(stage)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {isLandlord && (c.status === "signed" || c.status === "sent") ? (
              <DepositGuide province={c.listing?.province ?? null} deposit={Number(terms.deposit ?? 0)} />
            ) : null}
            {c.status === "cancelled" ? (
              <p className="rounded-2xl bg-surface p-4 text-sm text-muted">Este contrato se canceló y ya no se puede firmar.</p>
            ) : null}
            <section aria-label="Registro de firmas" className="space-y-2 rounded-3xl border border-border p-5 text-sm">
              <h2 className="font-bold">Registro de firmas</h2>
              <p>Enviado: {c.sent_at ? dateTime.format(new Date(c.sent_at)) : "—"}</p>
              <p>
                Parte arrendadora: {c.landlord_signed_at ? `${c.landlord_signature} · ${dateTime.format(new Date(c.landlord_signed_at))}` : "pendiente"}
              </p>
              <p>
                Parte arrendataria: {c.tenant_signed_at ? `${c.tenant_signature} · ${dateTime.format(new Date(c.tenant_signed_at))}` : "pendiente"}
              </p>
              <p className="break-all text-xs text-muted">Huella del texto (SHA-256): {c.document_hash}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
