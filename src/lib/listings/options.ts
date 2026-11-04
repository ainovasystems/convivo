import type { Database } from "@/types/database.types";

export type ListingKind = Database["public"]["Enums"]["listing_kind"];
export type ListingStatus = Database["public"]["Enums"]["listing_status"];

export const LISTING_KINDS = ["room", "flat", "seeking"] as const satisfies readonly ListingKind[];

export const KIND_LABELS: Record<ListingKind, string> = {
  room: "Habitación",
  flat: "Piso entero",
  seeking: "Busco compañero/piso",
};

export const KIND_DESCRIPTIONS: Record<ListingKind, string> = {
  room: "Alquilas una habitación en un piso compartido.",
  flat: "Alquilas un piso o estudio completo.",
  seeking: "Buscas habitación, piso o gente con quien compartir.",
};

export const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Borrador",
  active: "Publicado",
  paused: "Pausado",
  closed: "Cerrado",
};

export const RULE_KEYS = ["pets", "smoking", "visitors", "couples"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export const RULE_LABELS: Record<RuleKey, { yes: string; no: string; question: string }> = {
  pets: { yes: "Se admiten mascotas", no: "Sin mascotas", question: "¿Se admiten mascotas?" },
  smoking: { yes: "Se puede fumar", no: "No se fuma", question: "¿Se puede fumar en casa?" },
  visitors: { yes: "Se permiten visitas", no: "Sin visitas", question: "¿Se permiten visitas?" },
  couples: { yes: "Se admiten parejas", no: "No se admiten parejas", question: "¿Se admiten parejas?" },
};

export const MAX_PHOTOS = 8;

/** Las 52 provincias (y ciudades autónomas) de España, con su nombre oficial habitual. */
export const PROVINCES = [
  "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Barcelona",
  "Bizkaia", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real", "Córdoba",
  "Cuenca", "Gipuzkoa", "Girona", "Granada", "Guadalajara", "Huelva", "Huesca", "Illes Balears", "Jaén",
  "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga", "Melilla", "Murcia", "Navarra",
  "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Zamora", "Zaragoza",
] as const;

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const formatEuros = (n: number) => euro.format(n);

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
export const formatShortDate = (isoDate: string) => shortDate.format(new Date(`${isoDate}T12:00:00`));

/** Texto de precio de un anuncio según su tipo. */
export function priceText(l: { kind: ListingKind; monthly_rent: number | null; max_budget: number | null }) {
  if (l.kind === "seeking") return l.max_budget ? `Hasta ${formatEuros(l.max_budget)}/mes` : "Presupuesto sin indicar";
  return l.monthly_rent ? `${formatEuros(l.monthly_rent)}/mes` : "Precio sin indicar";
}
