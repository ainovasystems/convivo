import type { MetadataRoute } from "next";

import { isIndexingEnabled, ROBOTS_DISALLOW } from "@/lib/seo/indexing";
import { absoluteUrl, getBaseUrl } from "@/lib/seo/site";

// Depende de una variable de entorno de ejecución: no puede ser estática.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!isIndexingEnabled()) {
    // Web de pruebas: se bloquea todo y no se anuncia el sitemap.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const baseUrl = await getBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] }],
    sitemap: absoluteUrl(baseUrl, "/sitemap.xml"),
    host: baseUrl,
  };
}
