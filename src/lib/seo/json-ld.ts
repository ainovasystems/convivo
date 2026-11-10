import { KIND_LABELS, type ListingKind } from "@/lib/listings/options";
import { shorten } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/url";

/**
 * Datos estructurados (schema.org) en JSON-LD. Funciones puras: reciben la URL
 * base y los datos ya leídos. REGLA: solo datos públicos. Nunca la dirección
 * exacta, el código postal, el piso/puerta ni coordenadas (decisión 3):
 * `address` lleva solo localidad, provincia y país, y estas funciones ni
 * siquiera reciben la dirección.
 */
export type JsonLd = Record<string, unknown>;

export type ListingForLd = {
  id: string;
  kind: ListingKind;
  title: string;
  description: string;
  city: string | null;
  province: string | null;
  neighborhood: string | null;
  monthly_rent: number | null;
  size_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnished: boolean | null;
  published_at: string | null;
  updated_at: string;
};

export type RatingForLd = { count: number; average: number } | null;

/** Un anuncio de habitación o piso. Los «busco» no llevan datos estructurados. */
export function listingJsonLd(
  baseUrl: string,
  l: ListingForLd,
  photoUrls: string[],
  rating: RatingForLd = null,
): JsonLd | null {
  if (l.kind === "seeking") return null;
  const url = absoluteUrl(baseUrl, `/anuncios/${l.id}`);
  const place: JsonLd = {
    "@type": "PostalAddress",
    ...(l.city ? { addressLocality: l.city } : {}),
    ...(l.province ? { addressRegion: l.province } : {}),
    addressCountry: "ES",
  };
  const ld: JsonLd = {
    "@context": "https://schema.org",
    // Product permite el precio (Offer) y la valoración; Room/Apartment dicen qué es.
    "@type": ["Product", l.kind === "room" ? "Room" : "Apartment"],
    "@id": url,
    url,
    name: l.title,
    description: shorten(l.description, 300) || l.title,
    category: KIND_LABELS[l.kind],
    ...(photoUrls.length ? { image: photoUrls } : {}),
    address: place,
    ...(l.size_m2 ? { floorSize: { "@type": "QuantitativeValue", value: l.size_m2, unitCode: "MTK" } } : {}),
    ...(l.bedrooms !== null ? { numberOfBedrooms: l.bedrooms } : {}),
    ...(l.bathrooms !== null ? { numberOfBathroomsTotal: l.bathrooms } : {}),
    ...(l.furnished !== null ? { amenityFeature: [{ "@type": "LocationFeatureSpecification", name: "Amueblado", value: l.furnished }] } : {}),
    ...(l.published_at ? { datePosted: l.published_at } : {}),
    ...(l.monthly_rent
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: l.monthly_rent,
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: l.monthly_rent,
              priceCurrency: "EUR",
              unitCode: "MON",
            },
          },
        }
      : {}),
    ...(rating && rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(rating.average.toFixed(1)),
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
  return ld;
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(baseUrl: string, items: BreadcrumbItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(baseUrl, it.path),
    })),
  };
}

/** Página de ciudad: colección con la lista de anuncios (solo id y título). */
export function cityPageJsonLd(
  baseUrl: string,
  p: { path: string; name: string; description: string; items: Array<{ id: string; title: string }> },
): JsonLd {
  const url = absoluteUrl(baseUrl, p.path);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: p.name,
    description: p.description,
    inLanguage: "es-ES",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: p.items.length,
      itemListElement: p.items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(baseUrl, `/anuncios/${it.id}`),
        name: it.title,
      })),
    },
  };
}

/** Serializa para incrustar en <script>: escapa `<` para que un texto no pueda cerrar la etiqueta. */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
