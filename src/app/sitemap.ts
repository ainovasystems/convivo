import type { MetadataRoute } from "next";

import { hasPublicEnv } from "@/lib/env";
import { getSitemapListings } from "@/lib/listings/queries";
import { cityPagePath, CITY_PAGE_KINDS, SEO_CITIES } from "@/lib/seo/cities";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { absoluteUrl, getBaseUrl } from "@/lib/seo/site";

// Anuncios en vivo y variable de indexación: nunca estático.
export const dynamic = "force-dynamic";

/**
 * Páginas públicas indexables: portada, búsqueda, páginas de ciudad y
 * anuncios activos de habitación y piso (los «busco» son personas: no entran).
 * Con la indexación apagada devuelve un sitemap vacío.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexingEnabled()) return [];
  const baseUrl = await getBaseUrl();
  const u = (path: string) => absoluteUrl(baseUrl, path);

  const fixed: MetadataRoute.Sitemap = [
    { url: u("/"), changeFrequency: "daily", priority: 1 },
    { url: u("/anuncios"), changeFrequency: "daily", priority: 0.8 },
    ...SEO_CITIES.flatMap((c) =>
      (Object.keys(CITY_PAGE_KINDS) as Array<keyof typeof CITY_PAGE_KINDS>).map((seg) => ({
        url: u(cityPagePath(seg, c.slug)),
        changeFrequency: "daily" as const,
        priority: 0.9,
      })),
    ),
  ];
  if (!hasPublicEnv()) return fixed;

  let listings: Awaited<ReturnType<typeof getSitemapListings>> = [];
  try {
    listings = await getSitemapListings();
  } catch {
    // Sin base de datos, el sitemap sigue con las páginas fijas.
  }
  return [
    ...fixed,
    ...listings.map((l) => ({
      url: u(`/anuncios/${l.id}`),
      lastModified: new Date(l.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
