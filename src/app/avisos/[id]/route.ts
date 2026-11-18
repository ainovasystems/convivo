import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Abrir un aviso: lo marca como leído y lleva a su pantalla (el contrato, la
 * fianza, la liquidación…). RLS garantiza que solo se toca un aviso propio.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  const user = await getCurrentUser();
  if (!user) return to(`/entrar?next=${encodeURIComponent("/avisos")}`);
  if (!z.uuid().safeParse(id).success) return to("/avisos");

  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, url, read_at").eq("id", id).maybeSingle();
  if (!data) return to("/avisos");
  if (!data.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  return to(data.url ? safeNextPath(data.url, "/avisos") : "/avisos");
}
