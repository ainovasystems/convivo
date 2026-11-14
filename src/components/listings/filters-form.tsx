import Link from "next/link";

import { SearchIcon } from "@/components/brand/icons";
import { filterChips, SORTS, type ListingFilters } from "@/lib/listings/filters";
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          Periodo
          <select name="periodo" defaultValue={filters.periodo ?? ""} className={inputClass}>
            <option value="">Cualquiera</option>
            <option value="curso">Curso universitario</option>
            <option value="fechas">Fechas concretas</option>
            <option value="indefinido">Sin fecha de fin</option>
          </select>
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
      <fieldset className="grid gap-x-6 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Características</legend>
        {CHECKS.map(([name, label]) => (
          <label key={name} className="flex items-center gap-3 py-1.5 text-sm">
            <input
              type="checkbox"
              name={name}
              value="1"
              defaultChecked={Boolean(filters[name])}
              className="size-5 accent-[var(--brand)]"
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
        <Link href="/anuncios" className="rounded-full px-3 py-3 text-sm font-semibold text-brand underline">
          Limpiar
        </Link>
      </div>
    </form>
  );
}

/**
 * Panel de filtros: PLEGADO por defecto (la búsqueda arranca limpia). La
 * cabecera resume lo aplicado y debajo van los chips, que se quitan con un
 * toque. Es un <details>: se despliega sin JavaScript. Se rellena desde la
 * URL, así que tras buscar vuelve a quedar plegado con el resumen.
 */
export function FiltersPanel({ filters }: { filters: ListingFilters }) {
  const chips = filterChips(filters);
  const summary = chips.length ? chips.map((c) => c.label).join(" · ") : "Sin filtros";
  return (
    <section aria-label="Filtros de búsqueda" className="space-y-3">
      <details className="group rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-card)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="inline-flex items-center gap-2">
              <SearchIcon className="size-5 text-brand" /> Filtros y orden
            </span>
            <span className="block truncate text-sm font-normal text-muted">{summary}</span>
          </span>
          <span aria-hidden="true" className="text-brand transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="pt-4">
          <FiltersForm filters={filters} />
        </div>
      </details>
      {chips.length ? (
        <ul aria-label="Filtros aplicados" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.key}>
              <Link
                href={c.removeHref}
                aria-label={`Quitar filtro: ${c.label}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-strong hover:bg-brand/20 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {c.label}
                <span aria-hidden="true" className="text-base leading-none">×</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
