import "server-only";

import { getSignalSecret, getClientIp, hashSignal } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";

export type AuthAttemptKind = "login_failed" | "signup" | "magic_link";

/** Email normalizado para la huella: sin espacios, en minúsculas y en forma NFKC. */
export function normalizeEmail(email: string) {
  return email.normalize("NFKC").trim().toLowerCase();
}

async function hashes(email: string) {
  const secret = getSignalSecret();
  if (!secret) return null;
  return { ip: hashSignal(await getClientIp(), secret), email: hashSignal(normalizeEmail(email), secret) };
}

/**
 * ¿Se permite este intento? (función auth_rate_allowed de la BD). Sin
 * SIGNAL_SECRET, o si la BD no responde, se deja pasar: el límite propio de
 * Supabase Auth sigue funcionando y no queremos dejar a nadie sin entrar por
 * un fallo nuestro.
 */
export async function authAttemptAllowed(kind: AuthAttemptKind, email: string): Promise<boolean> {
  const h = await hashes(email);
  if (!h) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("auth_rate_allowed", { p_kind: kind, p_ip_hash: h.ip, p_email_hash: h.email });
  if (error) {
    console.error("auth_rate_allowed", error.message);
    return true;
  }
  return data !== false;
}

/** Registra un login fallido. Nunca lanza. */
export async function recordLoginFailure(email: string): Promise<void> {
  const h = await hashes(email);
  if (!h) return;
  try {
    const supabase = await createClient();
    await supabase.rpc("auth_rate_failed", { p_ip_hash: h.ip, p_email_hash: h.email });
  } catch {
    // No bloquea la respuesta al usuario.
  }
}

export const TOO_MANY_ATTEMPTS = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
