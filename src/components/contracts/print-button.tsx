"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border border-brand px-5 py-2.5 font-bold text-brand hover:bg-brand-soft print:hidden">
      Descargar o imprimir (PDF)
    </button>
  );
}
