import { test } from "@playwright/test";

/** Las pruebas que tocan datos se saltan si no hay Supabase configurado. */
export function requireSupabase() {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "Necesita Supabase (npx supabase start y .env.local)",
  );
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@convivo.test`;
}
