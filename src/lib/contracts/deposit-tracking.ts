import { z } from "zod";

import { sniffImageType } from "@/lib/validation/image";

/**
 * Seguimiento de la fianza de un contrato firmado. Las reglas las impone la BD
 * (20261116000100_deposit_tracking.sql); esto es el espejo para decidir qué se
 * muestra, los esquemas de los formularios y los textos. Hommie NO mueve
 * dinero: solo deja constancia.
 */
export const DEPOSIT_STATUSES = ["pending", "deposited", "returned", "claimed"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  pending: "Pendiente de depositar",
  deposited: "Depositada",
  returned: "Devuelta",
  claimed: "Reclamada: no recibida",
};

/** Días antes del vencimiento en que se avisa. */
export const RETURN_CLOSING_DAYS = 7;

export const DEPOSIT_TRACKING_NOTICE =
  "Hommie no cobra, no guarda ni mueve dinero: solo deja constancia de lo que anotáis. Información orientativa y borrador pendiente de revisión legal; no es asesoría jurídica.";

/** Etiqueta de una entrega de llaves que el casero no ha confirmado. Hommie NUNCA la da por confirmada. */
export const KEYS_UNCONFIRMED_LABEL = "Declarada por el inquilino, sin confirmar";
export const KEYS_UNCONFIRMED_NOTE =
  "Hommie no da esta fecha por confirmada: solo ha quedado registrada como declarada por el inquilino. El plazo de un mes se cuenta desde la fecha confirmada por el casero.";

export const RETURN_DEADLINE_TEXT =
  "El plazo para devolver la fianza es de un mes desde la entrega de llaves (art. 36.4 LAU). Es una indicación orientativa.";

/** Fila de seguimiento tal como la leen las partes (sin la ruta del resguardo). */
export type DepositRow = {
  status: DepositStatus;
  deposited_on: string | null;
  receipt_number: string | null;
  has_receipt: boolean;
  deposit_recorded_at: string | null;
  keys_declared_on: string | null;
  keys_declared_at: string | null;
  keys_confirmed_at: string | null;
  keys_confirmation: "landlord" | null;
  return_due_on: string | null;
  return_marked_on: string | null;
  return_marked_at: string | null;
  return_response: "confirmed" | "not_received" | null;
  return_response_at: string | null;
  /** Importe devuelto que anota el casero (informativo). */
  returned_amount: number | null;
};

/** Fila de un contrato sin seguimiento todavía. */
export const EMPTY_DEPOSIT: DepositRow = {
  status: "pending",
  deposited_on: null,
  receipt_number: null,
  has_receipt: false,
  deposit_recorded_at: null,
  keys_declared_on: null,
  keys_declared_at: null,
  keys_confirmed_at: null,
  keys_confirmation: null,
  return_due_on: null,
  return_marked_on: null,
  return_marked_at: null,
  return_response: null,
  return_response_at: null,
  returned_amount: null,
};

/** Fecha de hoy en España, como AAAA-MM-DD. */
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Días naturales de `from` a `to` (AAAA-MM-DD); positivo si `to` es posterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const dayFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" });
/** «3 de diciembre de 2026» a partir de AAAA-MM-DD. */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00Z`));
}

/** Suma un mes a AAAA-MM-DD como Postgres (`fecha + interval '1 month'`): el 31 de enero + 1 mes = 28 de febrero. */
export function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ty = m === 12 ? y + 1 : y;
  const tm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Estado del plazo de devolución. */
export type DepositClock =
  | { state: "not_started" }
  /** Fecha de llaves declarada por el inquilino y NO confirmada por el casero: no hay reloj oficial. `dueOn` = un mes desde la fecha declarada. */
  | { state: "unconfirmed"; dueOn: string; daysLeft: number }
  | { state: "unconfirmed_overdue"; dueOn: string; daysLate: number }
  | { state: "running"; daysLeft: number; dueOn: string }
  | { state: "closing"; daysLeft: number; dueOn: string }
  | { state: "overdue"; daysLate: number; dueOn: string }
  | { state: "awaiting_tenant"; dueOn: string }
  | { state: "done"; dueOn: string };

/** ¿Está el casero pendiente de devolver? (no devuelta, y sin una devolución marcada a la espera del inquilino) */
function pendingReturn(row: DepositRow) {
  return row.status !== "returned" && (row.return_marked_at === null || row.return_response === "not_received");
}

export function depositClock(row: DepositRow, today: string): DepositClock {
  if (!row.keys_confirmed_at || !row.return_due_on) {
    if (row.keys_declared_on && !row.keys_confirmed_at && row.status !== "returned") {
      const dueOn = addOneMonth(row.keys_declared_on);
      const left = daysBetween(today, dueOn);
      return left < 0 ? { state: "unconfirmed_overdue", dueOn, daysLate: -left } : { state: "unconfirmed", dueOn, daysLeft: left };
    }
    return { state: "not_started" };
  }
  const dueOn = row.return_due_on;
  if (row.status === "returned") return { state: "done", dueOn };
  if (!pendingReturn(row)) return { state: "awaiting_tenant", dueOn };
  const left = daysBetween(today, dueOn);
  if (left < 0) return { state: "overdue", daysLate: -left, dueOn };
  return left <= RETURN_CLOSING_DAYS ? { state: "closing", daysLeft: left, dueOn } : { state: "running", daysLeft: left, dueOn };
}

/**
 * El inquilino puede descargar el paquete de pruebas si venció el plazo y la
 * fianza no está devuelta: con la fecha confirmada, desde que vence el mes; con
 * la fecha solo declarada, pasado un mes desde ella (el paquete lo dice).
 */
export function canDownloadEvidence(row: DepositRow, today: string): boolean {
  const state = depositClock(row, today).state;
  return state === "overdue" || state === "unconfirmed_overdue";
}

/** ¿La fecha de llaves del paquete la confirmó el casero? */
export function keysAreConfirmed(row: DepositRow): boolean {
  return Boolean(row.keys_confirmed_at);
}

/** «Quedan 12 días», «Vence hoy», «Venció hace 4 días». */
export function clockSentence(clock: DepositClock): string {
  switch (clock.state) {
    case "not_started":
      return "El plazo empieza cuando se confirme la entrega de llaves.";
    case "unconfirmed":
      return `El casero no ha confirmado la fecha de llaves. Si no la confirma, el inquilino podrá descargar el paquete de pruebas pasado el ${formatDay(clock.dueOn)} (un mes desde la fecha declarada).`;
    case "unconfirmed_overdue":
      return `Ha pasado un mes desde la fecha declarada (${formatDay(clock.dueOn)}) y el casero no la ha confirmado.`;
    case "running":
    case "closing":
      if (clock.daysLeft === 0) return `Vence hoy (${formatDay(clock.dueOn)}).`;
      return `Quedan ${clock.daysLeft === 1 ? "1 día" : `${clock.daysLeft} días`} (hasta el ${formatDay(clock.dueOn)}).`;
    case "overdue":
      return `Venció el ${formatDay(clock.dueOn)} (hace ${clock.daysLate === 1 ? "1 día" : `${clock.daysLate} días`}).`;
    case "awaiting_tenant":
      return `Devolución marcada; falta que la confirme el inquilino. El plazo terminaba el ${formatDay(clock.dueOn)}.`;
    case "done":
      return "Devolución confirmada por las dos partes.";
  }
}

// -----------------------------------------------------------------------------
// Formularios
// -----------------------------------------------------------------------------
const isoDate = z.iso.date({ error: "Indica una fecha válida" });
const notFuture = (d: string) => d <= madridToday();

export const recordDepositSchema = z.object({
  deposited_on: isoDate.refine(notFuture, { error: "La fecha no puede ser futura" }),
  receipt_number: z.string().trim().min(1, { error: "Escribe el número de resguardo" }).max(60, { error: "Máximo 60 caracteres" }),
});

/** Importe devuelto (informativo): opcional, ≥ 0. Vacío = no se indica. */
export const returnSchema = z.object({
  date: isoDate.refine(notFuture, { error: "La fecha no puede ser futura" }),
  amount: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => v === "" || /^\d{1,7}(\.\d{1,2})?$/.test(v), { error: "Escribe un importe válido, p. ej. 250 o 250,50" })
    .transform((v) => (v === "" ? null : Number(v))),
});

export const dateOnlySchema = z.object({
  date: isoDate.refine(notFuture, { error: "La fecha no puede ser futura" }),
});

/** Resguardo: PDF o imagen, hasta 2,5 MB (el cuerpo de las Server Actions admite 3 MB). */
export const RECEIPT_MAX_BYTES = 2_500_000;
export const RECEIPT_EXTENSIONS = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
export type ReceiptExtension = keyof typeof RECEIPT_EXTENSIONS;

/** Tipo real del resguardo por sus primeros bytes (el MIME declarado se puede falsificar). */
export function sniffReceiptType(bytes: Uint8Array): ReceiptExtension | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "pdf";
  const image = sniffImageType(bytes);
  return image === "image/jpeg" ? "jpg" : image === "image/png" ? "png" : image === "image/webp" ? "webp" : null;
}

/** Ruta de un resguardo en el bucket: {contract_id}/{uuid}.{ext} */
export function isReceiptPath(path: string, contractId: string) {
  return new RegExp(`^${contractId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(pdf|jpg|png|webp)$`).test(path);
}

// -----------------------------------------------------------------------------
// Cronología
// -----------------------------------------------------------------------------
export const EVENT_LABELS: Record<string, string> = {
  deposit_recorded: "El casero anotó el depósito de la fianza",
  receipt_attached: "El casero subió el resguardo",
  keys_declared: "El inquilino declaró la fecha de entrega de llaves (sin confirmar por el casero)",
  keys_confirmed: "El casero confirmó la entrega de llaves",
  keys_reminder: "Recordatorio al casero: confirmar la entrega de llaves",
  keys_unconfirmed_due: "Aviso a las dos partes: ha pasado un mes desde la fecha de llaves declarada y el casero no la ha confirmado",
  return_closing: "Aviso a las dos partes: se acerca el plazo de devolución",
  return_overdue: "Aviso a las dos partes: venció el plazo de devolución",
  return_marked: "El casero marcó la fianza como devuelta",
  return_confirmed: "El inquilino confirmó que recibió la fianza",
  return_disputed: "El inquilino indicó que no recibió la fianza",
  settlement_opened: "El casero abrió la liquidación de salida",
  settlement_sent: "El casero envió la liquidación al inquilino",
  settlement_answered: "El inquilino respondió a las partidas de la liquidación",
  settlement_reopened: "El casero reabrió la liquidación (vuelve a estar en preparación)",
  settlement_confirmed: "Una de las partes confirmó la liquidación",
  settlement_locked: "Las dos partes confirmaron la liquidación: queda cerrada",
};

/** Texto de un evento con sus datos (parte que confirma, importes…). */
export function eventLabel(kind: string, data?: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  if (kind === "settlement_confirmed") {
    return d.party === "landlord" ? "El casero confirmó la liquidación" : d.party === "tenant" ? "El inquilino confirmó la liquidación" : EVENT_LABELS[kind];
  }
  if (kind === "settlement_answered" && typeof d.accepted === "number" && typeof d.rejected === "number") {
    return `El inquilino respondió a la liquidación: acepta ${d.accepted}, no acepta ${d.rejected}`;
  }
  return EVENT_LABELS[kind] ?? kind;
}
