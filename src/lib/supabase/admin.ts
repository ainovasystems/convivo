import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Cliente con service_role: SE SALTA RLS.
 * Solo para tareas de servidor muy acotadas (webhooks, tareas programadas,
 * moderación). Nunca lo importes desde un Client Component: el import de
 * "server-only" hace fallar el build si ocurre.
 */
export function createAdminClient() {
  const env = getPublicEnv();
  const serviceRoleKey = z
    .string()
    .min(1, "Falta SUPABASE_SERVICE_ROLE_KEY")
    .parse(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.secretkey);

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
