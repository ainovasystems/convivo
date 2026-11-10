import { textToBlocks } from "@/lib/contracts/templates";

/** Muestra el texto de un contrato: las líneas en mayúsculas son títulos de sección. */
export function ContractText({ text }: { text: string }) {
  const blocks = textToBlocks(text);
  return (
    <article className="space-y-3 rounded-3xl border border-border bg-background p-5 text-[15px] leading-relaxed shadow-[var(--shadow-card)] sm:p-8 print:border-0 print:p-0 print:shadow-none">
      {blocks.map((b, i) =>
        i === 0 ? (
          <h2 key={i} className="text-center text-lg font-extrabold">
            {b}
          </h2>
        ) : b === b.toUpperCase() && b.length < 120 ? (
          <h3 key={i} className="pt-3 text-sm font-bold tracking-wide text-brand">
            {b}
          </h3>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        ),
      )}
    </article>
  );
}
