/**
 * Recuperar la contraseña (auditoría I12). Funciones puras y textos, para que
 * los usen igual las páginas, las acciones y los tests.
 */

/** Pantalla donde se pide el enlace. */
export const RECOVERY_REQUEST_PATH = "/recuperar";
/** Pantalla donde se escribe la contraseña nueva (destino del enlace del email). */
export const RECOVERY_NEW_PASSWORD_PATH = "/recuperar/nueva";
/** A dónde va quien llega con un enlace caducado, ya usado o sin haber pasado por el email. */
export const RECOVERY_EXPIRED_PATH = `${RECOVERY_REQUEST_PATH}?error=enlace`;

/** Respuesta ÚNICA al pedir el enlace, exista o no la cuenta (no permite enumerar usuarios). */
export const RECOVERY_SENT_MESSAGE =
  "Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva. Revisa tu bandeja (y el spam).";

export const RECOVERY_EXPIRED_MESSAGE =
  "El enlace para cambiar la contraseña ha caducado o ya se ha usado. Pide otro y te enviamos uno nuevo.";

export const PASSWORD_CHANGED_MESSAGE = "Contraseña cambiada. Ya has entrado en tu cuenta.";

/** Minutos que hay para elegir la contraseña después de abrir el enlace del email. */
export const RECOVERY_WINDOW_MINUTES = 30;

/**
 * Formas de entrar que demuestran que se acaba de abrir un enlace enviado al
 * email de la cuenta (campo `amr` del token de sesión de Supabase). Entrar con
 * la contraseña («password») NO vale: la contraseña solo se cambia desde
 * «¿Olvidaste tu contraseña?», no con cualquier sesión abierta.
 */
const EMAIL_LINK_METHODS = new Set(["recovery", "otp", "magiclink"]);

/**
 * ¿Esta sesión viene de abrir, hace poco, un enlace del email? Lee el `amr` del
 * token (firmado por Supabase y ya validado con getClaims): no depende de
 * ninguna cookie nuestra ni de nada que el navegador pueda inventarse.
 */
export function cameFromEmailLink(amr: unknown, nowMs: number = Date.now()): boolean {
  if (!Array.isArray(amr)) return false;
  const nowSeconds = Math.floor(nowMs / 1000);
  return amr.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || typeof timestamp !== "number") return false;
    const age = nowSeconds - timestamp;
    // 60 s de margen por si los relojes no coinciden del todo.
    return EMAIL_LINK_METHODS.has(method) && age >= -60 && age <= RECOVERY_WINDOW_MINUTES * 60;
  });
}

/** ¿El enlace fallido era de recuperación? Decide a qué pantalla se vuelve desde /auth/callback. */
export function isRecoveryLink(type: string | null | undefined, next: string): boolean {
  return type === "recovery" || next === RECOVERY_REQUEST_PATH || next.startsWith(`${RECOVERY_REQUEST_PATH}/`);
}
