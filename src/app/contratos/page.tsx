import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { listMyContracts } from "@/lib/contracts/queries";
import { CONTRACT_KIND_LABELS, type ContractKind } from "@/lib/contracts/schema";

export const metadata: Metadata = { title: "Mis contratos", robots: { index: false } };

const STATUS = {
  draft: { label: "Borrador", tone: "bg-surface text-muted" },
  sent: { label: "Pendiente de firma", tone: "bg-accent/30 text-foreground" },
  signed: { label: "Firmado", tone: "bg-emerald-100 text-emerald-900" },
  cancelled: { label: "Cancelado", tone: "bg-surface text-muted line-through" },
} as const;

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/contratos");
  const contracts = await listMyContracts();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mis contratos</h1>
        <p className="mt-1 text-muted">
          El casero prepara el contrato desde la conversación, cuando acepta un interés. Al firmarlo los dos, la estancia queda
          confirmada.
        </p>
      </div>
      {contracts.length ? (
        <ul className="space-y-3">
          {contracts.map((c) => {
            const s = STATUS[c.status];
            const other = c.landlord_id === user.id ? c.tenant?.display_name : c.landlord?.display_name;
            return (
              <li key={c.id}>
                <Link href={`/contratos/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-card)] hover:border-brand">
                  <span>
                    <span className="block font-bold">{c.listing?.title ?? "Anuncio cerrado"}</span>
                    <span className="text-sm text-muted">
                      {CONTRACT_KIND_LABELS[c.kind as ContractKind]} · con {other}
                    </span>
                  </span>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + s.tone}>{s.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface p-4 text-muted">Todavía no tienes contratos.</p>
      )}
    </div>
  );
}
