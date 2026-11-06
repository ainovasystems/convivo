import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/** Rutas que exigen sesión. */
const PROTECTED_PREFIXES = ["/perfil/editar", "/publicar", "/mis-", "/mensajes", "/admin", "/resenas", "/cuenta"];
const PROTECTED_EXACT = ["/perfil"];

/** Rutas solo para visitantes sin sesión. */
const GUEST_ONLY = ["/entrar", "/registro"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_EXACT.includes(pathname) || PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.includes(pathname);
}

/**
 * Refresca la sesión de Supabase en cada petición y reenvía las cookies
 * actualizadas tanto a la petición (para los Server Components) como a la
 * respuesta (para el navegador).
 */
export async function updateSession(request: NextRequest, extraRequestHeaders: Record<string, string> = {}) {
  // Reenvía las cabeceras de la petición (con las cookies al día) más las
  // extra, p. ej. la CSP con su nonce, que Next.js lee para firmar sus scripts.
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(extraRequestHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };

  if (!hasPublicEnv()) {
    // Sin Supabase configurado (p. ej. primer arranque en local) dejamos
    // pasar la petición para que la web pública se pueda ver igualmente.
    return next();
  }
  const env = getPublicEnv();

  let response = next();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // IMPORTANTE: no metas código entre createServerClient y getClaims().
  // getClaims() valida el JWT (firma) y, si ha caducado, lo refresca.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    return redirectKeepingCookies(request, response, "/entrar", { next: pathname + search });
  }

  if (user && isGuestOnlyPath(pathname)) {
    const next = request.nextUrl.searchParams.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return redirectKeepingCookies(request, response, safe);
  }

  // Devuelve SIEMPRE `response` (con sus cookies). Si creas otra respuesta,
  // copia sus cookies o la sesión se desincronizará.
  return response;
}

/** Redirige conservando las cookies de sesión que haya podido refrescar Supabase. */
function redirectKeepingCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  params: Record<string, string> = {},
) {
  const url = request.nextUrl.clone();
  const [path, query] = pathname.split("?");
  url.pathname = path;
  url.search = query ? `?${query}` : "";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
