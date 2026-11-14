import type { Metadata } from "next";
import Link from "next/link";

import { FiltersPanel } from "@/components/listings/filters-form";
import { ListingCard } from "@/components/listings/listing-card";
import { Pagination } from "@/components/listings/pagination";
import { parseFilters } from "@/lib/listings/filters";
import { KIND_LABELS } from "@/lib/listings/options";
import { searchListings } from "@/lib/listings/queries";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const what = f.tipo ? KIND_LABELS[f.tipo] : "Habitaciones y pisos compartidos";
  const where = f.ciudad ?? f.provincia;
  return {
    title: where ? `${what} en ${where}` : what,
    description: `Anuncios de vivienda compartida${where ? ` en ${where}` : ""} con perfiles y reseñas verificadas.`,
    // Una sola URL canónica; las combinaciones de filtros no se indexan (ver el middleware).
    alternates: { canonical: "/anuncios" },
    // Solo si hay filtros: una clave `robots: undefined` taparía la del layout (noindex en pruebas).
    ...(Object.keys(await searchParams).length ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ListingsPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const { items, total } = await searchListings(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <FiltersPanel filters={filters} />
      <section aria-labelledby="resultados" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="resultados" className="text-2xl font-bold tracking-tight">
            Anuncios
          </h1>
          <p className="text-sm text-muted" aria-live="polite">
            {total === 1 ? "1 anuncio" : `${total} anuncios`}
          </p>
        </div>
        {items.length ? <h2 className="sr-only">Resultados</h2> : null}
        {items.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((l, i) => (
              <li key={l.id}>
                <ListingCard listing={l} priority={i === 0} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">No hay anuncios con estos filtros.</p>
            <p className="mt-1 text-sm text-muted">Prueba a ampliar el precio o quitar alguna característica.</p>
            <Link href="/anuncios" className="mt-4 inline-block font-medium text-brand underline">
              Ver todos los anuncios
            </Link>
          </div>
        )}
        <Pagination filters={filters} total={total} />
      </section>
    </div>
  );
}
