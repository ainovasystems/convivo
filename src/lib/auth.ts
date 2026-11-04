import "server-only";

import { cache } from "react";

import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * Usuario de la sesión actual, validado con getClaims() (verifica la firma
 * del JWT). Cacheado por petición. Devuelve null si no hay sesión o si
 * Supabase no está configurado.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!hasPublicEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
