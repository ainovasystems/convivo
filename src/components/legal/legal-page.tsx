import type { ReactNode } from "react";

/** Envoltorio de las páginas legales, con el aviso de borrador siempre visible. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-12">
      <p role="note" className="rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-900 ring-1 ring-amber-300">
        ⚠️ Borrador pendiente de revisión legal. Este texto no es definitivo y puede cambiar. Lo marcado como [POR
        COMPLETAR] falta por rellenar.
      </p>
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Última actualización: {updated}</p>
      </header>
      <div className="legal space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left">
        {children}
      </div>
    </div>
  );
}
