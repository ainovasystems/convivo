import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/** Rutas que exigen sesión. Se amplía en el Prompt 2. */
const PROTECTED_PREFIXES = ["/perfil/editar", "/publicar", "/mis-"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Refresca la sesión de Supabase en cada petición y reenvía las cookies
 * actualizadas tanto a la petición (para los Server Components) como a la
 * respuesta (para el navegador).
 */
export async function updateSession(request: NextRequest) {
  if (!hasPublicEnv()) {
    // Sin Supabase configurado (p. ej. primer arranque en local) dejamos
    // pasar la petición para que la web pública se pueda ver igualmente.
    return NextResponse.next({ request });
  }
  const env = getPublicEnv();

  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Devuelve SIEMPRE `response` (con sus cookies). Si creas otra respuesta,
  // copia sus cookies o la sesión se desincronizará.
  return response;
}
