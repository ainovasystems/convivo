import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/auth";

const otpTypeSchema = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * Destino de los enlaces de email de Supabase (confirmación y magic link).
 * Admite los dos formatos:
 *  - ?code=...                 (flujo PKCE, plantillas por defecto)
 *  - ?token_hash=...&type=...  (plantillas personalizadas)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = otpTypeSchema.safeParse(searchParams.get("type"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type.success) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/entrar?error=enlace", origin));
}
