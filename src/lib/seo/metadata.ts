import type { Metadata } from "next";

import { absoluteUrl } from "@/lib/seo/url";

type PageMeta = {
  baseUrl: string;
  /** Título SIN el sufijo « · Convivo» (lo pone la plantilla del layout). */
  title: string;
  description: string;
  /** Ruta canónica, con barra inicial y sin dominio ni parámetros. */
  path: string;
  /** Imagen para compartir: URL absoluta o ruta relativa al sitio. */
  image: string;
  imageAlt?: string;
  /** false si la imagen es una foto de tamaño desconocido: no se declaran medidas. */
  imageSized?: boolean;
  robots?: Metadata["robots"];
};

export const SITE_NAME = "Convivo";

/**
 * Metadatos completos de una página pública: título, descripción, canonical,
 * Open Graph y tarjeta de Twitter/WhatsApp. El openGraph de una página
 * REEMPLAZA al del layout (Next no lo mezcla), por eso se rellena entero.
 */
export function pageMetadata({ baseUrl, title, description, path, image, imageAlt, imageSized = true, robots }: PageMeta): Metadata {
  const url = absoluteUrl(baseUrl, path);
  const img = image.startsWith("http") ? image : absoluteUrl(baseUrl, image);
  const fullTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Solo si la página lo pide: una clave `robots: undefined` taparía la del layout (noindex en pruebas).
    ...(robots ? { robots } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "es_ES",
      url,
      title: fullTitle,
      description,
      images: [{ url: img, ...(imageSized ? { width: 1200, height: 630 } : {}), alt: imageAlt ?? title }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [img] },
  };
}

/** Recorta un texto en una palabra entera y añade «…» si lo ha acortado. */
export function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:–-]+$/, "")}…`;
}

/** URL absoluta de una foto pública ya optimizada (JPEG de 1200 px para WhatsApp, redes y buscadores). */
export function shareablePhotoUrl(baseUrl: string, publicPhotoUrl: string): string {
  return absoluteUrl(baseUrl, `/_next/image?url=${encodeURIComponent(publicPhotoUrl)}&w=1200&q=75`);
}
