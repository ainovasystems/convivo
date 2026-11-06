import { NextResponse } from "next/server";

import { buildDataExport } from "@/lib/account/export";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/mis-datos → JSON descargable con los datos de la persona que lo pide. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para descargar tus datos." }, { status: 401 });

  const data = await buildDataExport(await createClient(), user);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="convivo-mis-datos-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
