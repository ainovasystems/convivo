"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { deleteDraft, duplicateListing, setListingStatus } from "@/app/publicar/actions";
import type { ListingStatus } from "@/lib/listings/options";

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-brand disabled:opacity-50";

export function MyListingActions({ id, status, title }: { id: string; status: ListingStatus; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string } | void>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && !r.ok) setError(r.message ?? "No se ha podido completar la acción.");
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-label={`Acciones para ${title}`} role="group">
        {status !== "closed" ? (
          <Link href={`/publicar/${id}?paso=${status === "draft" ? "datos" : "datos"}`} className={btn}>
            {status === "draft" ? "Continuar" : "Editar"}
          </Link>
        ) : null}
        {status === "active" ? (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => setListingStatus(id, "paused"))}>
            Pausar
          </button>
        ) : null}
        {status === "paused" ? (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => setListingStatus(id, "active"))}>
            Reactivar
          </button>
        ) : null}
        {status === "active" || status === "paused" ? (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() => run(() => setListingStatus(id, "closed"), "¿Cerrar el anuncio? Ya no se podrá reactivar (puedes duplicarlo).")}
          >
            Cerrar
          </button>
        ) : null}
        <button type="button" className={btn} disabled={pending} onClick={() => run(() => duplicateListing(id))}>
          Duplicar
        </button>
        {status === "draft" ? (
          <button
            type="button"
            className={btn + " text-red-700 dark:text-red-400"}
            disabled={pending}
            onClick={() => run(() => deleteDraft(id), "¿Borrar este borrador? No se puede deshacer.")}
          >
            Borrar
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
