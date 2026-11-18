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
export type Province = (typeof PROVINCES)[number];

/** Periodo de alquiler (columna listings.rental_term). */
export const RENTAL_TERMS = ["indefinite", "academic_year", "fixed"] as const;
export type RentalTerm = (typeof RENTAL_TERMS)[number];
export const RENTAL_TERM_LABELS: Record<RentalTerm, string> = {
  indefinite: "Sin fecha de fin",
  academic_year: "Curso universitario",
  fixed: "Fechas concretas",
};

/**
 * Curso universitario EN MARCHA para una fecha de entrada (auditoría I15): el
 * curso va del 1 de septiembre al 30 de junio. Quien entra de septiembre a junio
 * termina el 30 de junio de ese curso (entrando en diciembre de 2026, junio de
 * 2027); quien entra en julio o agosto, el del curso que empieza en septiembre.
 * Sin fecha de entrada se propone hoy (o el 1 de septiembre si es verano).
 */
export function academicYearFor(start?: string | null, today = new Date()) {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const valid = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null;
  const base = valid ?? iso(today);
  const year = Number(base.slice(0, 4));
  const month = Number(base.slice(5, 7));
  const summer = month === 7 || month === 8;
  const from = valid ?? (summer ? `${year}-09-01` : base);
  return { from, until: `${month >= 7 ? year + 1 : year}-06-30` };
}

/** Texto corto del periodo: "Curso 2027/28", "Hasta 30 jun 2027" o null. */
export function periodText(l: { rental_term: RentalTerm; available_until: string | null }) {
  if (l.rental_term === "academic_year" && l.available_until) {
    const y = Number(l.available_until.slice(0, 4));
    return `Curso ${y - 1}/${String(y).slice(2)}`;
  }
  if (l.rental_term === "fixed" && l.available_until) return `Hasta ${formatShortDate(l.available_until)}`;
  return null;
}

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const formatEuros = (n: number) => euro.format(n);

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
export const formatShortDate = (isoDate: string) => shortDate.format(new Date(`${isoDate}T12:00:00`));

/** Texto de precio de un anuncio según su tipo. */
export function priceText(l: { kind: ListingKind; monthly_rent: number | null; max_budget: number | null }) {
  if (l.kind === "seeking") return l.max_budget ? `Hasta ${formatEuros(l.max_budget)}/mes` : "Presupuesto sin indicar";
  return l.monthly_rent ? `${formatEuros(l.monthly_rent)}/mes` : "Precio sin indicar";
}
