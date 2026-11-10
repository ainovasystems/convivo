import { headers } from "next/headers";

import { serializeJsonLd, type JsonLd } from "@/lib/seo/json-ld";

/**
 * Inserta datos estructurados. Un bloque application/ld+json es un dato, no
 * código, así que la CSP no lo bloquea; aun así lleva el nonce de la petición
 * (lo pone el middleware en `x-nonce`) para cumplir la política sin excepciones.
 */
export async function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Contenido propio, serializado con `<` escapado (ver serializeJsonLd).
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
