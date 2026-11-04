/**
 * Valores permitidos de los campos de perfil y sus etiquetas en español.
 * Deben coincidir con los CHECK y enums de la base de datos
 * (private.valid_habits, public.age_range, public.user_role).
 */

export const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const USER_ROLES = ["tenant", "landlord", "flatmate"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: "Inquilino/a",
  landlord: "Propietario/a",
  flatmate: "Compañero/a de piso",
};

export const LANGUAGES = {
  es: "Español",
  gl: "Gallego",
  ca: "Catalán",
  eu: "Euskera",
  en: "Inglés",
  fr: "Francés",
  pt: "Portugués",
  it: "Italiano",
  de: "Alemán",
  ar: "Árabe",
  ro: "Rumano",
  zh: "Chino",
} as const;
export type LanguageCode = keyof typeof LANGUAGES;
export const LANGUAGE_CODES = Object.keys(LANGUAGES) as [LanguageCode, ...LanguageCode[]];

export const SCHEDULES = ["early", "standard", "night", "shifts"] as const;
export const SCHEDULE_LABELS: Record<(typeof SCHEDULES)[number], string> = {
  early: "Madrugador/a",
  standard: "Horario estándar",
  night: "Nocturno/a",
  shifts: "Trabajo a turnos",
};

export const GUESTS = ["rarely", "sometimes", "often"] as const;
export const GUESTS_LABELS: Record<(typeof GUESTS)[number], string> = {
  rarely: "Visitas: casi nunca",
  sometimes: "Visitas: a veces",
  often: "Visitas: a menudo",
};

export const CLEANLINESS_LABELS: Record<number, string> = {
  1: "Limpieza: relajada",
  2: "Limpieza: básica",
  3: "Limpieza: normal",
  4: "Limpieza: ordenado/a",
  5: "Limpieza: muy ordenado/a",
};

export const NOISE_LABELS: Record<number, string> = {
  1: "Muy tranquilo/a",
  2: "Tranquilo/a",
  3: "Ruido normal",
  4: "Animado/a",
  5: "Muy animado/a",
};

export type Habits = {
  smoker?: boolean;
  pets?: boolean;
  schedule?: (typeof SCHEDULES)[number];
  cleanliness?: number;
  noise?: number;
  guests?: (typeof GUESTS)[number];
};

/** Convierte los hábitos en "chips" legibles. */
export function habitChips(habits: Habits): string[] {
  const chips: string[] = [];
  if (habits.smoker !== undefined) chips.push(habits.smoker ? "Fumador/a" : "No fumador/a");
  if (habits.pets !== undefined) chips.push(habits.pets ? "Con mascotas" : "Sin mascotas");
  if (habits.schedule) chips.push(SCHEDULE_LABELS[habits.schedule]);
  if (habits.cleanliness) chips.push(CLEANLINESS_LABELS[habits.cleanliness]);
  if (habits.noise) chips.push(NOISE_LABELS[habits.noise]);
  if (habits.guests) chips.push(GUESTS_LABELS[habits.guests]);
  return chips;
}
