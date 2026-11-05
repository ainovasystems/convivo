import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * Señales anti-abuso: guardamos HMAC-SHA256 de la IP y del navegador, nunca
 * los valores en claro. Sirven para detectar que autor y sujeto de una reseña
 * comparten conexión o dispositivo. Sin SIGNAL_SECRET no se registra nada.
 */
export function hashSignal(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function recordSignal(): Promise<void> {
  // Se acepta también `signalsecret` (algunos paneles no dejan usar guiones bajos).
  const secret = process.env.SIGNAL_SECRET ?? process.env.signalsecret;
  if (!secret) return;
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "desconocida").split(",")[0].trim();
    const ua = h.get("user-agent") ?? "desconocido";
    const supabase = await createClient();
    await supabase.rpc("record_signal", { p_ip_hash: hashSignal(ip, secret), p_ua_hash: hashSignal(ua, secret) });
  } catch {
    // Nunca bloquea la acción del usuario.
  }
}
