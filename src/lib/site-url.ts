import "server-only";

import { headers } from "next/headers";

/**
 * URL base del sitio para construir enlaces de email (confirmación, magic
 * link). Usa NEXT_PUBLIC_SITE_URL si existe; si no, la cabecera Host.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
