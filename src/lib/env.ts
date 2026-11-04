import { z } from "zod";

/**
 * Variables públicas (se incrustan en el bundle del navegador).
 * Nunca añadas aquí nada secreto.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Next.js solo sustituye `process.env.NEXT_PUBLIC_*` cuando se accede de
 * forma literal, por eso se leen una a una y no con `process.env` entero.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Faltan o son inválidas las variables públicas de Supabase " +
        "(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
        "Revisa .env.local o los ajustes del entorno.",
    );
  }
  return parsed.data;
}

/** Devuelve true si las variables públicas están configuradas. */
export function hasPublicEnv(): boolean {
  return publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}
