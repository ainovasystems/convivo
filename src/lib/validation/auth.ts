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

export const signUpSchema = z.object({
  displayName: z
    .string({ error: "Escribe tu nombre" })
    .trim()
    .min(2, { error: "Tu nombre debe tener al menos 2 caracteres" })
    .max(60, { error: "Tu nombre no puede pasar de 60 caracteres" }),
  email,
  password: z
    .string({ error: "Elige una contraseña" })
    .min(8, { error: "La contraseña debe tener al menos 8 caracteres" })
    .max(72, { error: "La contraseña no puede pasar de 72 caracteres" }),
  acceptTerms: z.literal("on", { error: "Debes aceptar las condiciones para continuar" }),
});

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
