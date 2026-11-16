import { z } from "zod";

import { compareWithEntry, type ItemCondition } from "@/lib/contracts/inventory";

/**
 * Liquidación de salida de la fianza. Las reglas las impone la BD
 * (20261117000100_deposit_settlement.sql); esto es el espejo para decidir qué se
 * muestra, los esquemas de los formularios y los textos. Convivo SOLO DOCUMENTA:
 * no media, no propone cifras, no decide quién tiene razón y no toca dinero.
 */
export const SETTLEMENT_STATUSES = ["draft", "sent", "agreed", "disputed"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: "En preparación",
  sent: "Enviada",
  agreed: "De acuerdo",
  disputed: "Con discrepancias",
};

export const SETTLEMENT_NOTICE =
  "Convivo solo deja constancia de lo que anotáis: no media, no propone cifras, no decide quién tiene razón y no mueve dinero. Esta liquidación es informativa, no tiene valor de sentencia ni de arbitraje y es un borrador pendiente de revisión legal; no es asesoría jurídica.";

export const SETTLEMENT_DISPUTE_NOTICE =
  "Si no hay acuerdo, el resumen de la liquidación sirve como constancia de lo que cada parte dijo y cuándo. Las discrepancias se hablan en la conversación que ya tenéis.";

export const WEAR_NOTICE =
  "El desgaste por el uso normal no se descuenta de la fianza, por eso no se ofrece como partida. Solo se pueden vincular a un elemento los daños nuevos: lo que a la entrada estaba sin daños y a la salida está dañado.";

export const CONFIRM_NOTICE =
  "Confirmar deja cerrado el registro tal como está, con las respuestas de cada partida. No significa aceptar las partidas que se hayan rechazado. Una vez confirmada por las dos partes, no se puede cambiar.";

export const SETTLEMENT_MAX_ITEMS = 50;

export type SettlementRow = {
  id: string;
  contract_id: string;
  status: SettlementStatus;
  deposit_amount: number;
  sent_at: string | null;
  sent_hash: string | null;
  responded_at: string | null;
  landlord_confirmed_at: string | null;
  tenant_confirmed_at: string | null;
  locked_at: string | null;
  final_hash: string | null;
  created_at: string;
};

export type SettlementItemRow = {
  id: string;
  sort_order: number;
  concept: string;
  amount: number;
  inventory_item_id: string | null;
  tenant_response: "accepted" | "rejected" | null;
  tenant_comment: string | null;
  responded_at: string | null;
};

/** Etiqueta del estado, teniendo en cuenta si ya está cerrada. */
export function settlementStatusLabel(row: Pick<SettlementRow, "status" | "locked_at">): string {
  const base = SETTLEMENT_STATUS_LABELS[row.status];
  return row.locked_at ? `${base} · cerrada` : base;
}

/** Suma en céntimos para no arrastrar errores de coma flotante. */
export function settlementTotals(items: { amount: number }[], deposit: number) {
  const totalCents = items.reduce((acc, i) => acc + Math.round(i.amount * 100), 0);
  const depositCents = Math.round(deposit * 100);
  return {
    total: totalCents / 100,
    deposit: depositCents / 100,
    /** Lo que queda de la fianza si se aplican todas las partidas (nunca negativo). */
    remaining: Math.max(0, depositCents - totalCents) / 100,
    exceeds: totalCents > depositCents,
  };
}

/** Totales de lo aceptado y lo rechazado, para el resumen. */
export function answeredTotals(items: SettlementItemRow[]) {
  const sum = (r: "accepted" | "rejected") => items.filter((i) => i.tenant_response === r).reduce((a, i) => a + Math.round(i.amount * 100), 0) / 100;
  return { accepted: sum("accepted"), rejected: sum("rejected") };
}

type InvItem = { id: string; area: string; name: string; condition: ItemCondition };

const key = (i: { area: string; name: string }) => `${i.area.trim().toLowerCase()}|${i.name.trim().toLowerCase()}`;

/** Elemento de la entrada equivalente (misma zona y nombre; el último anotado, como la BD). */
export function entryMatch<T extends { area: string; name: string }>(entryItems: T[], exitItem: { area: string; name: string }): T | null {
  const matches = entryItems.filter((e) => key(e) === key(exitItem));
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

/**
 * Qué se puede descontar de la fianza según la comparación entrada/salida:
 *  - `newDamages`: daño nuevo (sin daños a la entrada, dañado a la salida): descontable;
 *  - `wear`: desgaste por el uso normal: NO descontable (se avisa);
 *  - `unmatched`: dañado a la salida sin elemento equivalente en la entrada, o ya
 *    dañado a la entrada: no se puede vincular (se pueden escribir como partida libre).
 */
export function classifyExit<T extends InvItem>(exitItems: T[], entryItems: InvItem[]) {
  const compared = compareWithEntry(exitItems, entryItems);
  const newDamages: T[] = [];
  const wear: T[] = [];
  const unmatched: T[] = [];
  exitItems.forEach((item, idx) => {
    if (compared[idx].newDamage) newDamages.push(item);
    else if (item.condition === "worn") wear.push(item);
    else if (item.condition === "damaged") unmatched.push(item);
  });
  return { newDamages, wear, unmatched };
}

// -----------------------------------------------------------------------------
// Formularios
// -----------------------------------------------------------------------------
/** «1.234,50» o «120» → número (o NaN). Admite coma decimal. */
export function parseAmount(raw: string): number {
  const v = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(v) ? Number(v) : Number.NaN;
}

export const settlementItemSchema = z.object({
  concept: z.string().trim().min(1, { error: "Escribe el concepto" }).max(120, { error: "Máximo 120 caracteres" }),
  amount: z
    .string()
    .transform(parseAmount)
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 1_000_000, { error: "Escribe un importe mayor que cero, p. ej. 120 o 120,50" }),
  inventory_item_id: z.uuid().nullable().default(null),
});

export const settlementAnswerSchema = z
  .object({
    item_id: z.uuid(),
    response: z.enum(["accepted", "rejected"], { error: "Elige acepto o no acepto" }),
    comment: z.string().trim().max(500, { error: "Máximo 500 caracteres" }).default(""),
  })
  .refine((a) => a.response !== "rejected" || a.comment.length >= 3, {
    path: ["comment"],
    error: "Explica con unas palabras por qué no aceptas la partida",
  });
export const settlementAnswersSchema = z.array(settlementAnswerSchema).min(1, { error: "No hay partidas que responder" }).max(SETTLEMENT_MAX_ITEMS);
export type SettlementAnswer = z.infer<typeof settlementAnswerSchema>;
