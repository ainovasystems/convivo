import type { Database } from "@/types/database.types";

export type ReviewRelationship = Database["public"]["Enums"]["review_relationship"];

/** Secciones del perfil: reseñas recibidas "como" cada rol. */
export const PROFILE_REVIEW_GROUPS: ReadonlyArray<{
  relationship: Exclude<ReviewRelationship, "tenant_to_listing">;
  title: string;
  empty: string;
}> = [
  { relationship: "landlord_to_tenant", title: "Como inquilino/a", empty: "Aún no tiene reseñas como inquilino/a." },
  { relationship: "tenant_to_landlord", title: "Como propietario/a", empty: "Aún no tiene reseñas como propietario/a." },
  { relationship: "flatmate_to_flatmate", title: "Como compañero/a", empty: "Aún no tiene reseñas como compañero/a." },
];

export const CRITERIA_LABELS: Record<string, string> = {
  // inmueble
  cleanliness: "Limpieza",
  accuracy: "Fiel al anuncio",
  area: "Zona",
  condition: "Estado",
  value: "Calidad-precio",
  // propietario
  communication: "Comunicación",
  treatment: "Trato",
  compliance: "Cumplimiento",
  deposit: "Fianza",
  // inquilino
  payment_punctuality: "Puntualidad en el pago",
  home_care: "Cuidado de la vivienda",
  coexistence: "Convivencia",
  // compañero
  noise: "Ruido",
  respect: "Respeto",
};

const ratingFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatRating = (value: number) => ratingFormat.format(value);

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

const monthFormat = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
export const formatMonth = (iso: string) => monthFormat.format(new Date(iso));

export type StatsRow = { relationship: ReviewRelationship; review_count: number; avg_rating: number };

/** Media global ponderada por número de reseñas. */
export function overallRating(rows: ReadonlyArray<StatsRow>): { avg: number; count: number } | null {
  const count = rows.reduce((n, r) => n + Number(r.review_count), 0);
  if (count === 0) return null;
  const sum = rows.reduce((s, r) => s + Number(r.avg_rating) * Number(r.review_count), 0);
  return { avg: sum / count, count };
}
