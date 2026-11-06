import { z } from "zod";

import { GUESTS, LANGUAGE_CODES, maxBirthYear, SCHEDULES, USER_ROLES } from "@/lib/profile/options";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} no puede pasar de ${max} caracteres` })
    .transform((v) => (v === "" ? null : v))
    .nullable();

const score = z.coerce.number().int().min(1).max(5);

/** Hábitos: mismas claves cerradas que el CHECK private.valid_habits. */
export const habitsSchema = z
  .strictObject({
    smoker: z.boolean().optional(),
    pets: z.boolean().optional(),
    schedule: z.enum(SCHEDULES).optional(),
    cleanliness: score.optional(),
    noise: score.optional(),
    guests: z.enum(GUESTS).optional(),
  })
  .default({});

export const profileSchema = z.object({
  displayName: z
    .string({ error: "Escribe tu nombre" })
    .trim()
    .min(2, { error: "Tu nombre debe tener al menos 2 caracteres" })
    .max(60, { error: "Tu nombre no puede pasar de 60 caracteres" }),
  bio: optionalText(1000, "La presentación"),
  city: optionalText(80, "La ciudad"),
  occupation: optionalText(80, "La ocupación"),
  birthYear: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number({ error: "Escribe el año con cuatro cifras" })
      .int({ error: "Escribe el año con cuatro cifras" })
      .min(new Date().getFullYear() - 110, { error: "Revisa el año de nacimiento" })
      .max(maxBirthYear(), { error: "Para usar Convivo tienes que tener 18 años o más" })
      .nullable(),
  ),
  languages: z.array(z.enum(LANGUAGE_CODES)).max(10, { error: "Elige como máximo 10 idiomas" }),
  roles: z.array(z.enum(USER_ROLES)),
  habits: habitsSchema,
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Traduce el FormData del formulario de perfil a un objeto para el esquema.
 * Los selects vacíos ("") significan "sin indicar".
 */
export function profileFormDataToObject(fd: FormData) {
  const str = (key: string) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : "";
  };
  const tri = (key: string): boolean | undefined => {
    const v = str(key);
    return v === "yes" ? true : v === "no" ? false : undefined;
  };
  const opt = (key: string) => str(key) || undefined;

  return {
    displayName: str("displayName"),
    bio: str("bio"),
    city: str("city"),
    occupation: str("occupation"),
    birthYear: str("birthYear") || null,
    languages: fd.getAll("languages").filter((v): v is string => typeof v === "string"),
    roles: fd.getAll("roles").filter((v): v is string => typeof v === "string"),
    habits: Object.fromEntries(
      Object.entries({
        smoker: tri("smoker"),
        pets: tri("pets"),
        schedule: opt("schedule"),
        cleanliness: opt("cleanliness"),
        noise: opt("noise"),
        guests: opt("guests"),
      }).filter(([, v]) => v !== undefined),
    ),
  };
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const avatarFileSchema = z
  .instanceof(File, { error: "Selecciona una imagen" })
  .refine((f) => f.size > 0, { error: "Selecciona una imagen" })
  .refine((f) => f.size <= AVATAR_MAX_BYTES, { error: "La imagen no puede pasar de 2 MB" })
  .refine((f) => (AVATAR_TYPES as readonly string[]).includes(f.type), {
    error: "Formato no admitido: usa JPG, PNG o WebP",
  });

/** Errores de Zod aplanados por campo (primer mensaje de cada uno). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
