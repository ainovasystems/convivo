import { z } from "zod";

import { sniffImageType } from "@/lib/validation/image";

/**
 * Seguimiento de la fianza de un contrato firmado. Las reglas las impone la BD
 * (20261116000100_deposit_tracking.sql); esto es el espejo para decidir qué se
 * muestra, los esquemas de los formularios y los textos. Convivo NO mueve
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

/** Días que tiene el casero para confirmar la entrega de llaves antes de darse por confirmada. */
export const KEYS_AUTO_CONFIRM_DAYS = 7;
/** Días antes del vencimiento en que se avisa. */
export const RETURN_CLOSING_DAYS = 7;

export const DEPOSIT_TRACKING_NOTICE =
  "Convivo no cobra, no guarda ni mueve dinero: solo deja constancia de lo que anotáis. Información orientativa y borrador pendiente de revisión legal; no es asesoría jurídica.";

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
  keys_confirmation: "landlord" | "auto" | null;
  return_due_on: string | null;
  return_marked_on: string | null;
  return_marked_at: string | null;
  return_response: "confirmed" | "not_received" | null;
  return_response_at: string | null;
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

/** Fecha (AAAA-MM-DD en España) en que se dará por confirmada una entrega de llaves declarada en `declaredAt`. */
export function keysAutoConfirmDay(declaredAt: string): string {
  return madridToday(new Date(Date.parse(declaredAt) + KEYS_AUTO_CONFIRM_DAYS * 86_400_000));
}

/** Estado del plazo de devolución. */
export type DepositClock =
  | { state: "not_started" }
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
  if (!row.keys_confirmed_at || !row.return_due_on) return { state: "not_started" };
  const dueOn = row.return_due_on;
  if (row.status === "returned") return { state: "done", dueOn };
  if (!pendingReturn(row)) return { state: "awaiting_tenant", dueOn };
  const left = daysBetween(today, dueOn);
  if (left < 0) return { state: "overdue", daysLate: -left, dueOn };
  return left <= RETURN_CLOSING_DAYS ? { state: "closing", daysLeft: left, dueOn } : { state: "running", daysLeft: left, dueOn };
}

/** El inquilino puede descargar el paquete de pruebas si venció el plazo y la fianza no está devuelta. */
export function canDownloadEvidence(row: DepositRow, today: string): boolean {
  return depositClock(row, today).state === "overdue";
}

/** «Quedan 12 días», «Vence hoy», «Venció hace 4 días». */
export function clockSentence(clock: DepositClock): string {
  switch (clock.state) {
    case "not_started":
      return "El plazo empieza cuando se confirme la entrega de llaves.";
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
  keys_declared: "El inquilino declaró la entrega de llaves",
  keys_confirmed: "El casero confirmó la entrega de llaves",
  keys_auto_confirmed: "Se dio por confirmada la entrega de llaves (7 días sin respuesta del casero)",
  return_closing: "Aviso a las dos partes: se acerca el plazo de devolución",
  return_overdue: "Aviso a las dos partes: venció el plazo de devolución",
  return_marked: "El casero marcó la fianza como devuelta",
  return_confirmed: "El inquilino confirmó que recibió la fianza",
  return_disputed: "El inquilino indicó que no recibió la fianza",
};
