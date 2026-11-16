import { CONDITION_LABELS } from "@/lib/contracts/inventory";
import type { InventoryItemView } from "@/lib/contracts/inventory-queries";

function Photos({ item }: { item: InventoryItemView }) {
  if (item.photos.length === 0) return <p className="text-muted">Sin fotos.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {item.photos.map((p, n) =>
        p.url ? (
          <span key={p.path}>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de un bucket privado */}
            <img src={p.url} alt={`${item.area} · ${item.name}, foto ${n + 1}`} loading="lazy" className="size-28 rounded-lg object-cover ring-1 ring-border print:size-36" />
          </span>
        ) : null,
      )}
    </div>
  );
}

/** Elemento del inventario al que se refiere una partida: estado y fotos de la entrada y de la salida. */
export function ElementCompare({ entry, exit }: { entry: InventoryItemView | null; exit: InventoryItemView }) {
  return (
    <div className="grid gap-3 rounded-xl bg-surface p-3 text-sm sm:grid-cols-2 print:break-inside-avoid">
      <div className="space-y-1">
        <p className="font-semibold">
          Entrada · {entry ? CONDITION_LABELS[entry.condition] : "sin registro"}
        </p>
        {entry?.notes ? <p className="text-muted">{entry.notes}</p> : null}
        {entry ? <Photos item={entry} /> : null}
      </div>
      <div className="space-y-1">
        <p className="font-semibold">Salida · {CONDITION_LABELS[exit.condition]}</p>
        {exit.notes ? <p className="text-muted">{exit.notes}</p> : null}
        <Photos item={exit} />
      </div>
    </div>
  );
}
