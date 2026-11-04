import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 * Actúa en nombre del usuario de la sesión (cookies) y respeta RLS.
 * Crea uno nuevo por petición; no lo guardes en una variable global.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component, donde no se pueden escribir
            // cookies. Es seguro ignorarlo: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}
