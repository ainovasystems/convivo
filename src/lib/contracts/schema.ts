import { z } from "zod";

/**
 * Condiciones de un contrato (columna contracts.terms). El mismo esquema se usa
 * en el formulario del casero y en el servidor. Sin DNI: las partes se
 * identifican por su nombre completo y su cuenta de Convivo (decisión de no
 * guardar documentos de identidad; pendiente de validar con el abogado).
 */
export const CONTRACT_KINDS = ["room", "flat_habitual", "flat_seasonal"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  room: "Habitación en vivienda compartida",
  flat_habitual: "Vivienda habitual (piso entero)",
  flat_seasonal: "Alquiler de temporada (piso entero, p. ej. un curso)",
};

/** Cambia la versión cada vez que cambie el texto de las plantillas. */
export const TEMPLATE_VERSION = "2026-11-borrador-1";

const name = z.string().trim().min(5, { error: "Escribe el nombre y los apellidos" }).max(120);
const isoDate = z.iso.date({ error: "Fecha no válida" });
const money = (label: string, min: number) =>
  z.coerce.number({ error: `${label}: escribe un número` }).int({ error: `${label}: sin decimales` }).min(min).max(20000);

export const contractTermsSchema = z
  .object({
    landlord_name: name,
    tenant_name: name,
    address: z.string().trim().min(10, { error: "Escribe la dirección completa (calle, número, piso, código postal y ciudad)" }).max(300),
    room_description: z.string().trim().max(300).default(""),
    monthly_rent: money("Renta", 1),
    deposit: money("Fianza", 0),
    payment_day: z.coerce.number().int().min(1, { error: "Día de pago entre 1 y 28" }).max(28, { error: "Día de pago entre 1 y 28" }),
    start_date: isoDate,
    end_date: z.preprocess((v) => (v === "" ? null : v), isoDate.nullable()).default(null),
    bills_included: z.boolean().default(false),
    bills_note: z.string().trim().max(500).default(""),
    furnished: z.boolean().default(true),
    seasonal_reason: z.string().trim().max(300).default(""),
    house_rules: z.string().trim().max(2000).default(""),
    extra_clauses: z.string().trim().max(3000).default(""),
  })
  .superRefine((t, ctx) => {
    if (t.end_date && t.end_date <= t.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "La fecha de fin debe ser posterior a la de entrada" });
    }
    if (t.landlord_name.toLowerCase() === t.tenant_name.toLowerCase()) {
      ctx.addIssue({ code: "custom", path: ["tenant_name"], message: "Las dos partes no pueden tener el mismo nombre" });
    }
  });

export type ContractTerms = z.infer<typeof contractTermsSchema>;

/** Lo que exige cada tipo además del esquema común. */
export function contractKindErrors(kind: ContractKind, t: ContractTerms): Record<string, string> {
  const e: Record<string, string> = {};
  if (kind === "flat_seasonal") {
    if (!t.end_date) e.end_date = "Un alquiler de temporada necesita fecha de fin";
    if (t.seasonal_reason.length < 10) e.seasonal_reason = "Explica el motivo de la temporada (p. ej. estudios en el curso 2027/28)";
  }
  return e;
}

/** Avisos que no impiden enviar. */
export function contractWarnings(kind: ContractKind, t: ContractTerms): string[] {
  const w: string[] = [];
  if (kind === "flat_habitual" && t.deposit > t.monthly_rent) {
    w.push("En vivienda habitual la fianza legal es de una mensualidad. Lo que pidas de más es una garantía adicional, con un límite de dos mensualidades.");
  }
  if (kind === "flat_seasonal" && t.deposit > t.monthly_rent * 2) {
    w.push("En alquiler de temporada la fianza legal es de dos mensualidades.");
  }
  return w;
}

/** Tipo sugerido según el anuncio: habitación, o piso por periodo de alquiler. */
export function suggestedKind(listingKind: "room" | "flat", rentalTerm: string): ContractKind {
  if (listingKind === "room") return "room";
  return rentalTerm === "indefinite" ? "flat_habitual" : "flat_seasonal";
}
