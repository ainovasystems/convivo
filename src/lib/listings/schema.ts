import { z } from "zod";

import { LISTING_KINDS, MAX_PHOTOS, PROVINCES, RULE_KEYS } from "@/lib/listings/options";

/**
 * Esquemas de anuncio. Reflejan los CHECK de la tabla public.listings:
 *  - listingDraftSchema: todo opcional (autoguardado del borrador).
 *  - listingPublishSchema: lo obligatorio para publicar, según el tipo.
 */

const text = (max: number) => z.string().trim().max(max, { error: `Máximo ${max} caracteres` });
const nullableText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();
const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label}: escribe un número` })
    .int({ error: `${label}: sin decimales` })
    .min(min, { error: `${label}: mínimo ${min}` })
    .max(max, { error: `${label}: máximo ${max}` });
const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), int(min, max, label).nullable());
const isoDate = z.iso.date({ error: "Fecha no válida" });
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), isoDate.nullable());
const optionalBool = z.boolean().nullable();

export const rulesSchema = z.partialRecord(z.enum(RULE_KEYS), z.boolean());

export const addressSchema = z.object({
  addressLine: text(200),
  floorDoor: text(40),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, { error: "El código postal tiene 5 cifras" }),
});

export const listingDraftSchema = z.object({
  title: text(120).default(""),
  description: text(5000).default(""),
  city: nullableText(80).default(null),
  province: z.enum(PROVINCES, { error: "Elige una provincia" }).nullable().default(null),
  neighborhood: nullableText(120).default(null),
  monthlyRent: optionalInt(50, 20000, "Precio").default(null),
  deposit: optionalInt(0, 100000, "Fianza").default(null),
  availableFrom: optionalDate.default(null),
  minStayMonths: optionalInt(1, 60, "Estancia mínima").default(null),
  billsIncluded: optionalBool.default(null),
  furnished: optionalBool.default(null),
  rules: rulesSchema.default({}),
  sizeM2: optionalInt(5, 2000, "Superficie").default(null),
  bedrooms: optionalInt(0, 50, "Habitaciones").default(null),
  bathrooms: optionalInt(0, 20, "Baños").default(null),
  currentFlatmates: optionalInt(0, 20, "Compañeros").default(null),
  maxBudget: optionalInt(50, 20000, "Presupuesto").default(null),
  zones: z.array(text(60).min(1)).max(10, { error: "Máximo 10 zonas" }).default([]),
  moveInDate: optionalDate.default(null),
  address: addressSchema.default({ addressLine: "", floorDoor: "", postalCode: "" }),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;
export type ListingDraftInput = z.input<typeof listingDraftSchema>;

const required = <T>(v: T | null | undefined) => v !== null && v !== undefined;

/**
 * Comprueba lo necesario para publicar. Devuelve errores por campo (vacío si
 * se puede publicar). Separado del esquema de borrador para poder enseñar en
 * el paso "Revisión" qué falta exactamente.
 */
export function publishErrors(kind: (typeof LISTING_KINDS)[number], d: ListingDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.title.trim().length < 10) e.title = "El título debe tener al menos 10 caracteres";
  if (d.description.trim().length < 30) e.description = "La descripción debe tener al menos 30 caracteres";
  if (!d.city) e.city = "Indica la ciudad";
  if (!d.province) e.province = "Elige la provincia";

  if (kind === "seeking") {
    if (!required(d.maxBudget)) e.maxBudget = "Indica tu presupuesto máximo";
    if (d.zones.length === 0) e.zones = "Indica al menos una zona";
    if (!required(d.moveInDate)) e.moveInDate = "Indica cuándo quieres entrar";
  } else {
    if (!required(d.monthlyRent)) e.monthlyRent = "Indica el precio mensual";
    if (!required(d.availableFrom)) e.availableFrom = "Indica desde cuándo está disponible";
  }
  return e;
}

export const photosSchema = z.array(z.string().min(1)).max(MAX_PHOTOS, { error: `Máximo ${MAX_PHOTOS} fotos` });

/** Las fotos deben estar en la carpeta {owner}/{listing}/ del bucket. */
export function photoPathBelongsTo(path: string, ownerId: string, listingId: string) {
  return new RegExp(`^${ownerId}/${listingId}/[A-Za-z0-9._-]{1,100}$`).test(path);
}

/** Campos que no aplican al tipo se envían a null (respetan el CHECK de exclusividad). */
export function toListingRow(kind: (typeof LISTING_KINDS)[number], d: ListingDraft) {
  const isSeeking = kind === "seeking";
  return {
    title: d.title,
    description: d.description,
    city: d.city,
    province: d.province,
    neighborhood: d.neighborhood,
    monthly_rent: isSeeking ? null : d.monthlyRent,
    deposit: isSeeking ? null : d.deposit,
    available_from: isSeeking ? null : d.availableFrom,
    min_stay_months: isSeeking ? null : d.minStayMonths,
    bills_included: isSeeking ? null : d.billsIncluded,
    furnished: isSeeking ? null : d.furnished,
    rules: isSeeking ? {} : d.rules,
    size_m2: isSeeking ? null : d.sizeM2,
    bedrooms: isSeeking ? null : d.bedrooms,
    bathrooms: isSeeking ? null : d.bathrooms,
    current_flatmates: kind === "room" ? d.currentFlatmates : null,
    max_budget: isSeeking ? d.maxBudget : null,
    zones: isSeeking ? d.zones : [],
    move_in_date: isSeeking ? d.moveInDate : null,
  };
}
