import Link from "next/link";

import { SORTS, type ListingFilters } from "@/lib/listings/filters";
import { KIND_LABELS, LISTING_KINDS, PROVINCES } from "@/lib/listings/options";
import { inputClass } from "@/components/ui/field";

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  recientes: "Más recientes",
  precio_asc: "Precio: menor primero",
  precio_desc: "Precio: mayor primero",
};

const CHECKS = [
  ["amueblado", "Amueblado"],
  ["gastos", "Gastos incluidos"],
  ["mascotas", "Admite mascotas"],
  ["fumadores", "Se puede fumar"],
] as const;

/**
 * Formulario GET: al enviarlo, el navegador escribe los filtros en la URL.
 * Funciona sin JavaScript y cada búsqueda es un enlace compartible.
 */
export function FiltersForm({ filters }: { filters: ListingFilters }) {
  return (
    <form method="get" action="/anuncios" className="space-y-4" aria-label="Filtros de búsqueda">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="block space-y-1 text-sm font-medium">
          Tipo
          <select name="tipo" defaultValue={filters.tipo ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {LISTING_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Provincia
          <select name="provincia" defaultValue={filters.provincia ?? ""} className={inputClass}>
            <option value="">Todas</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Ciudad
          <input name="ciudad" defaultValue={filters.ciudad ?? ""} className={inputClass} placeholder="Ej.: Lugo" />
        </label>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-medium">Precio al mes (€)</legend>
          <label className="text-sm">
            <span className="sr-only">Precio mínimo</span>
            <input
              name="precio_min"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Mín."
              defaultValue={filters.precio_min ?? ""}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">Precio máximo</span>
            <input
              name="precio_max"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Máx."
              defaultValue={filters.precio_max ?? ""}
              className={inputClass}
            />
          </label>
        </fieldset>
        <label className="block space-y-1 text-sm font-medium">
          Disponible el
          <input name="desde" type="date" defaultValue={filters.desde ?? ""} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Ordenar por
          <select name="orden" defaultValue={filters.orden ?? "recientes"} className={inputClass}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Características</legend>
        {CHECKS.map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value="1"
              defaultChecked={Boolean(filters[name])}
              className="size-4 accent-[var(--brand)]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Buscar
        </button>
        <Link href="/anuncios" className="rounded-full px-3 py-2.5 text-sm font-semibold text-brand underline">
          Limpiar
        </Link>
      </div>
    </form>
  );
}
