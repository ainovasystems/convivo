import { z } from "zod";

const email = z
  .string({ error: "Escribe tu email" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ese email no parece válido" }));

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Escribe tu contraseña" }).min(1, { error: "Escribe tu contraseña" }),
});

export const magicLinkSchema = z.object({ email });

/** Reglas de la contraseña: las mismas al registrarse y al elegir una nueva. */
const newPassword = z
  .string({ error: "Elige una contraseña" })
  .min(8, { error: "La contraseña debe tener al menos 8 caracteres" })
  .max(72, { error: "La contraseña no puede pasar de 72 caracteres" });

/** «¿Olvidaste tu contraseña?»: solo el email. */
export const passwordResetRequestSchema = z.object({ email });

/** Contraseña nueva, escrita dos veces. */
export const newPasswordSchema = z
  .object({
    password: newPassword,
    passwordConfirm: z.string({ error: "Repite la contraseña" }).min(1, { error: "Repite la contraseña" }),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ["passwordConfirm"],
    error: "Las dos contraseñas no coinciden",
  });

export const signUpSchema = z.object({
  displayName: z
    .string({ error: "Escribe tu nombre" })
    .trim()
    .min(2, { error: "Tu nombre debe tener al menos 2 caracteres" })
    .max(60, { error: "Tu nombre no puede pasar de 60 caracteres" }),
  email,
  password: newPassword,
  isAdult: z.literal("on", { error: "Para usar Hommie tienes que ser mayor de edad" }),
  acceptTerms: z.literal("on", { error: "Debes aceptar las condiciones para continuar" }),
});

/** Versión de las condiciones que se acepta al registrarse (cámbiala al modificarlas). */
export const TERMS_VERSION = "2026-11-19-borrador";

/**
 * Respuesta ÚNICA del registro, tenga o no ya una cuenta ese email (auditoría
 * I10): por el registro no se puede saber si un email existe. Quien ya tenía
 * cuenta no recibe email, así que el mensaje le lleva a entrar o a recuperar
 * la contraseña (el formulario pone los enlaces).
 */
export const SIGN_UP_SENT_MESSAGE = "Te hemos enviado un email para continuar. Abre el enlace para confirmar tu cuenta.";
export const SIGN_UP_EXISTING_HINT = "¿Ya tenías cuenta con ese email? Entonces no te llegará nada:";

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Evita redirecciones abiertas: solo se aceptan rutas internas ("/algo"),
 * nunca "//dominio" ni URLs absolutas.
 */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
