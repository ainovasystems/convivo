"use client";

import Link from "next/link";
import { useEffect } from "react";

import { reportClientError } from "@/lib/monitoring/report";

/** Error inesperado en una página: mensaje amable y opción de reintentar. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[convivo] error en la página", error);
    reportClientError(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">🏚️</p>
      <h1 className="mt-4 text-2xl font-extrabold">Algo se ha torcido</h1>
      <p className="mt-2 text-muted">
        No hemos podido cargar esta página. Suele ser algo puntual: prueba otra vez en unos segundos.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-brand px-6 py-3 font-bold text-brand-foreground hover:bg-brand-strong">
          Reintentar
        </button>
        <Link href="/" className="rounded-full border border-border px-6 py-3 font-bold hover:border-brand">
          Ir al inicio
        </Link>
      </div>
      {error.digest ? <p className="mt-6 text-xs text-muted">Código del error: {error.digest}</p> : null}
    </div>
  );
}
