import type { NextRequest } from "next/server";

import { buildCsp, createNonce } from "@/lib/security/headers";
import { isIndexingEnabled, robotsTagFor } from "@/lib/seo/indexing";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const response = await updateSession(request, { "x-nonce": nonce, "content-security-policy": csp });
  response.headers.set("Content-Security-Policy", csp);
  // Indexación: apagada = noindex en todo; encendida = solo lo privado y las búsquedas filtradas.
  const robots = robotsTagFor(request.nextUrl.pathname, request.nextUrl.search, isIndexingEnabled());
  if (robots) response.headers.set("X-Robots-Tag", robots);
  return response;
}

export const config = {
  matcher: [
    // Todo salvo estáticos, imágenes optimizadas y ficheros con extensión de imagen.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
