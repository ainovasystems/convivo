import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { InventoryEditor, OpenInventoryButton } from "@/components/contracts/inventory-editor";
import { PrintButton } from "@/components/contracts/print-button";
import { getCurrentUser } from "@/lib/auth";
import { STAGE_LABELS, stageFromSlug, type ItemCondition } from "@/lib/contracts/inventory";
import { getInventory, listContractInventories } from "@/lib/contracts/inventory-queries";
import { getContract } from "@/lib/contracts/queries";

export const metadata: Metadata = { title: "Inventario", robots: { index: false } };

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

export default async function InventoryPage({ params }: { params: Promise<{ id: string; etapa: string }> }) {
  const { id, etapa } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/contratos/${id}/inventario/${etapa}`);
  const stage = stageFromSlug(etapa);
  if (!stage || !z.uuid().safeParse(id).success) notFound();
  const c = await getContract(id);
  if (!c) notFound();

  const isLandlord = c.landlord_id === user.id;
  const otherName = (isLandlord ? c.tenant?.display_name : c.landlord?.display_name) ?? "La otra parte";
  const [inventory, all] = await Promise.all([getInventory(id, stage), listContractInventories(id)]);
  const entryLocked = all.some((i) => i.stage === "entry" && i.locked_at);

  let entryConditions: Record<string, ItemCondition> | undefined;
  if (stage === "exit" && inventory) {
    const entry = await getInventory(id, "entry");
    entryConditions = Object.fromEntries(
      (entry?.items ?? []).map((i) => [`${i.area.toLowerCase()}|${i.name.toLowerCase()}`, i.condition]),
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <Link href={`/contratos/${id}`} className="text-sm font-medium text-brand underline print:hidden">
          ← Volver al contrato
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{STAGE_LABELS[stage]}</h1>
        <p className="text-sm text-muted">
          {c.listing?.title ?? "Vivienda"} · entre {c.landlord?.display_name} y {c.tenant?.display_name}
        </p>
      </div>
      {inventory?.locked_at ? <PrintButton /> : null}
    </div>
  );

  if (c.status !== "signed") {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-10">
        {header}
        <p className="rounded-2xl bg-surface p-4 text-muted">El inventario se hace cuando el contrato está firmado por las dos partes.</p>
      </div>
    );
  }

  if (!inventory) {
    const blocked = stage === "exit" && !entryLocked;
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-10">
        {header}
        <div className="space-y-3 rounded-3xl bg-surface p-5">
          {stage === "entry" ? (
            <>
              <p>
                Al entrar a vivir, anotad juntos qué hay en la vivienda y en qué estado está, con fotos. Cuando lo confirméis los dos, quedará
                guardado sin cambios y servirá para devolver la fianza sin discusiones.
              </p>
              <p className="text-sm text-muted">Consejo: hacedlo el día de la entrega de llaves, recorriendo la vivienda zona por zona.</p>
            </>
          ) : (
            <p>
              Al terminar el contrato, revisad juntos el estado de la vivienda. Podréis copiar los elementos del inventario de entrada y
              comparar. El desgaste por el uso normal no se descuenta de la fianza.
            </p>
          )}
          {blocked ? (
            <p className="font-semibold">Primero tenéis que confirmar los dos el inventario de entrada.</p>
          ) : (
            <OpenInventoryButton contractId={id} stage={stage} />
          )}
        </div>
      </div>
    );
  }

  const iConfirmedAt = isLandlord ? inventory.landlord_confirmed_at : inventory.tenant_confirmed_at;
  const otherConfirmedAt = isLandlord ? inventory.tenant_confirmed_at : inventory.landlord_confirmed_at;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-10">
      {header}
      {inventory.locked_at ? (
        <section aria-label="Registro de confirmaciones" className="space-y-1 rounded-3xl border border-border p-5 text-sm">
          <p className="font-bold">Confirmado por las dos partes el {dateTime.format(new Date(inventory.locked_at))}.</p>
          <p>
            Parte arrendadora ({c.landlord?.display_name}): {inventory.landlord_confirmed_at ? dateTime.format(new Date(inventory.landlord_confirmed_at)) : "—"}
          </p>
          <p>
            Parte arrendataria ({c.tenant?.display_name}): {inventory.tenant_confirmed_at ? dateTime.format(new Date(inventory.tenant_confirmed_at)) : "—"}
          </p>
          <p className="text-muted">Referencia del contrato: {c.id}</p>
        </section>
      ) : null}
      <InventoryEditor
        contractId={id}
        inventoryId={inventory.id}
        stage={stage}
        items={inventory.items}
        locked={Boolean(inventory.locked_at)}
        iConfirmed={Boolean(iConfirmedAt)}
        otherConfirmed={Boolean(otherConfirmedAt)}
        otherName={otherName}
        entryConditions={entryConditions}
        canCopyEntry={stage === "exit"}
      />
    </div>
  );
}
