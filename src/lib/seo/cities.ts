import { findCity, normalizeCity } from "@/lib/listings/cities";
import type { ListingKind, Province } from "@/lib/listings/options";

/**
 * Páginas públicas de ciudad (/habitaciones/lugo, /pisos/lugo).
 * Solo las ciudades del piloto y las que ya tienen datos de ejemplo. Para
 * añadir una, basta con su nombre OFICIAL (el de `cities.ts`): el slug y la
 * provincia salen solos, y entra en el sitemap y en los enlaces.
 */
const SEO_CITY_NAMES = ["Lugo", "A Coruña", "Madrid", "Barcelona"] as const;

export type SeoCity = { slug: string; name: string; province: Province };

export function citySlug(name: string): string {
  return normalizeCity(name).replace(/ /g, "-");
}

export const SEO_CITIES: readonly SeoCity[] = SEO_CITY_NAMES.map((name) => {
  const known = findCity(name);
  if (!known) throw new Error(`La ciudad «${name}» no está en src/lib/listings/cities.ts`);
  return { slug: citySlug(known.name), name: known.name, province: known.province };
});

export function findSeoCity(slug: string): SeoCity | null {
  return SEO_CITIES.find((c) => c.slug === slug) ?? null;
}

/** Tipos de página de ciudad: el primer tramo de la URL. */
export const CITY_PAGE_KINDS = {
  habitaciones: { kind: "room" as const satisfies ListingKind, other: "pisos" as const },
  pisos: { kind: "flat" as const satisfies ListingKind, other: "habitaciones" as const },
};
export type CityPageSegment = keyof typeof CITY_PAGE_KINDS;

export function isCityPageSegment(s: string): s is CityPageSegment {
  return Object.hasOwn(CITY_PAGE_KINDS, s);
}

export function cityPagePath(segment: CityPageSegment, slug: string): string {
  return `/${segment}/${slug}`;
}

/** Textos de la página según el tipo. `price` es el precio mínimo, si hay anuncios. */
export function cityPageCopy(segment: CityPageSegment, city: string, count: number, minPrice: number | null) {
  const from = minPrice !== null ? ` desde ${Math.round(minPrice)} €/mes` : "";
  if (segment === "habitaciones") {
    return {
      title: `Habitaciones en alquiler en ${city}: pisos compartidos`,
      h1: `Habitaciones en pisos compartidos en ${city}`,
      description:
        count > 0
          ? `${count} ${count === 1 ? "habitación" : "habitaciones"} en piso compartido en ${city}${from}. Perfiles de compañeros y reseñas verificadas tras una estancia real.`
          : `Habitaciones en pisos compartidos en ${city}. Aún no hay anuncios: publica el tuyo o avisa de que buscas compañero.`,
      intro: `Alquila una habitación en un piso compartido en ${city} y conoce con quién vas a vivir: cada perfil muestra reseñas de compañeros y caseros que de verdad han convivido.`,
    };
  }
  return {
    title: `Pisos enteros en alquiler en ${city}`,
    h1: `Pisos enteros en alquiler en ${city}`,
    description:
      count > 0
        ? `${count} ${count === 1 ? "piso" : "pisos"} en alquiler en ${city}${from}, para ir por libre o con tu grupo de amigos. Con reseñas verificadas del propietario.`
        : `Pisos enteros en alquiler en ${city}. Aún no hay anuncios: publica el tuyo o avisa de que buscas piso.`,
    intro: `Pisos completos en ${city} para vivir solo o con tus amigos, con las reseñas verificadas de quien ya los ha alquilado.`,
  };
}
