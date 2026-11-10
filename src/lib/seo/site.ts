import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * URL base para todo lo absoluto (sitemap, canonical, Open Graph, JSON-LD).
 * Sale SIEMPRE de la variable pública (NEXT_PUBLIC_SITE_URL / siteurl); sin
 * ella, de la cabecera Host, que solo sirve en local y en las pruebas.
 * Ninguna URL escrita a mano: el día que haya dominio solo cambia la variable.
 */
export async function getBaseUrl(): Promise<string> {
  return getSiteUrl();
}

export { absoluteUrl } from "@/lib/seo/url";
