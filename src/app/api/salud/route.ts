import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getPublicEnv, hasPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Comprobación de disponibilidad para el monitor de Sentry (docs/DEPLOY.md →
 * Sentry → «Disponibilidad»). Responde 200 si la web y la base de datos
 * contestan, y 503 si no. No da detalles (la página humana es /estado) ni
 * lee nada privado: una consulta de recuento a los anuncios públicos.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  if (!hasPublicEnv()) return NextResponse.json({ ok: false }, { status: 503, headers });
  const env = getPublicEnv();
  const supabase = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active");
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers });
}
