import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingCard } from "@/components/listings/listing-card";
import { JsonLdScript } from "@/components/seo/json-ld";
import { CITY_PAGE_LIMIT, getCityPageData } from "@/lib/listings/queries";
import { serializeFilters } from "@/lib/listings/filters";
import {
  cityPageCopy,
  cityPagePath,
  CITY_PAGE_KINDS,
  findSeoCity,
  SEO_CITIES,
  type CityPageSegment,
} from "@/lib/seo/cities";
import { breadcrumbJsonLd, cityPageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { getBaseUrl } from "@/lib/seo/site";

const SEGMENT_LABEL: Record<CityPageSegment, string> = { habitaciones: "Habitaciones", pisos: "Pisos" };

export async function cityPageMetadata(segment: CityPageSegment, slug: string): Promise<Metadata> {
  const city = findSeoCity(slug);
  if (!city) return {};
  const [baseUrl, data] = await Promise.all([getBaseUrl(), getCityPageData(city.name, CITY_PAGE_KINDS[segment].kind)]);
  const copy = cityPageCopy(segment, city.name, data.total, data.minPrice);
  return pageMetadata({
    baseUrl,
    title: copy.title,
    description: copy.description,
    path: cityPagePath(segment, city.slug),
    image: `/og/ciudad/${segment}/${city.slug}`,
    imageAlt: copy.h1,
  });
}

export async function CityPage({ segment, slug }: { segment: CityPageSegment; slug: string }) {
  const city = findSeoCity(slug);
  if (!city) notFound();
  const { kind, other } = CITY_PAGE_KINDS[segment];
  const [baseUrl, data] = await Promise.all([getBaseUrl(), getCityPageData(city.name, kind)]);
  const copy = cityPageCopy(segment, city.name, data.total, data.minPrice);
  const path = cityPagePath(segment, city.slug);
  const searchHref = `/anuncios${serializeFilters({ tipo: kind, ciudad: city.name })}`;
  const seekingHref = `/anuncios${serializeFilters({ tipo: "seeking", ciudad: city.name })}`;
  const noun = segment === "habitaciones" ? "habitaciones" : "pisos";

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <JsonLdScript
        data={[
          breadcrumbJsonLd(baseUrl, [
            { name: "Inicio", path: "/" },
            { name: SEGMENT_LABEL[segment], path: "/anuncios" + serializeFilters({ tipo: kind }) },
            { name: city.name, path },
          ]),
          cityPageJsonLd(baseUrl, { path, name: copy.h1, description: copy.description, items: data.items }),
        ]}
      />
      <nav aria-label="Migas de pan" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-brand">Inicio</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/anuncios${serializeFilters({ tipo: kind })}`} className="hover:text-brand">
              {SEGMENT_LABEL[segment]}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-foreground">{city.name}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{copy.h1}</h1>
        <p className="max-w-3xl text-muted">{copy.intro}</p>
        {data.total ? (
          <p className="text-sm text-muted">
            {data.total === 1 ? "1 anuncio" : `${data.total} anuncios`}
            {data.minPrice !== null ? ` · desde ${Math.round(data.minPrice)} €/mes` : null}
          </p>
        ) : null}
      </header>

      {data.items.length ? (
        <section aria-labelledby="anuncios" className="space-y-6">
          <h2 id="anuncios" className="sr-only">Anuncios en {city.name}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((l, i) => (
              <li key={l.id}>
                <ListingCard
                  listing={l}
                  priority={i < 3}
                  photoAlt={`${kind === "room" ? "Habitación" : "Piso"} en ${[l.neighborhood, l.city].filter(Boolean).join(", ")}`}
                />
              </li>
            ))}
          </ul>
          {data.total > CITY_PAGE_LIMIT ? (
            <p>
              <Link href={searchHref} className="font-medium text-brand underline">
                Ver los {data.total} anuncios y filtrar por precio, fechas y más
              </Link>
            </p>
          ) : (
            <p>
              <Link href={searchHref} className="font-medium text-brand underline">
                Filtrar por precio, fechas y más
              </Link>
            </p>
          )}
        </section>
      ) : (
        <section aria-labelledby="vacio" className="rounded-2xl border border-dashed border-border p-8 text-center">
          <h2 id="vacio" className="font-semibold">Todavía no hay {noun} publicados en {city.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {data.seekingCount
              ? `Pero hay ${data.seekingCount === 1 ? "1 persona" : `${data.seekingCount} personas`} buscando en ${city.name}.`
              : "Sé de los primeros: publica el tuyo o cuenta que estás buscando y te encontrarán."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/publicar" className="rounded-full bg-brand px-5 py-2.5 font-bold text-brand-foreground hover:bg-brand-strong">
              Publicar un anuncio
            </Link>
            <Link href={seekingHref} className="rounded-full border border-border px-5 py-2.5 font-bold text-brand hover:bg-brand-soft">
              {data.seekingCount ? "Ver quién busca" : "Publicar que busco"}
            </Link>
          </div>
        </section>
      )}

      <section aria-labelledby="mas" className="space-y-3 border-t border-border pt-6">
        <h2 id="mas" className="text-lg font-semibold">Sigue buscando</h2>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href={cityPagePath(other, city.slug)} className="inline-block rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand hover:bg-border">
              {other === "pisos" ? "Pisos enteros" : "Habitaciones"} en {city.name}
            </Link>
          </li>
          {data.seekingCount ? (
            <li>
              <Link href={seekingHref} className="inline-block rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand hover:bg-border">
                Quién busca en {city.name}
              </Link>
            </li>
          ) : null}
          {SEO_CITIES.filter((c) => c.slug !== city.slug).map((c) => (
            <li key={c.slug}>
              <Link href={cityPagePath(segment, c.slug)} className="inline-block rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand hover:bg-border">
                {SEGMENT_LABEL[segment]} en {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
