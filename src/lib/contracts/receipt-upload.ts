import { RECEIPT_MAX_BYTES } from "@/lib/contracts/deposit-tracking";
import { compressImage } from "@/lib/images/compress";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const RECEIPT_ERRORS = {
  type: "Ese fichero no vale: sube una foto (JPG, PNG o WebP) o un PDF.",
  pdfTooBig: "El PDF pesa demasiado: como mucho 2,5 MB. Prueba a hacerle una foto al resguardo.",
  unreadable: "No hemos podido leer esa foto. Prueba con otra, o con un PDF.",
  stillTooBig: "La foto sigue pesando demasiado. Prueba con otra, o con un PDF de hasta 2,5 MB.",
} as const;

/** Qué hay que hacer con el fichero elegido, sin tocarlo todavía (para poder probarlo sin navegador). */
export function receiptPlan(file: { type: string; size: number; name: string }): { error: string } | { action: "compress" | "send" } {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return file.size > RECEIPT_MAX_BYTES ? { error: RECEIPT_ERRORS.pdfTooBig } : { action: "send" };
  if (IMAGE_TYPES.includes(file.type)) return { action: "compress" };
  return { error: RECEIPT_ERRORS.type };
}

/**
 * Prepara el resguardo de la fianza antes de enviarlo (auditoría I2): una foto de
 * móvil pesa varios MB y la subida admite 2,5, así que se reduce en el navegador
 * igual que las fotos de los anuncios (y pierde la ubicación GPS). Un PDF se
 * envía tal cual si cabe. Nunca lanza: devuelve el fichero listo o el motivo.
 */
export async function prepareReceipt(file: File): Promise<{ file: File } | { error: string }> {
  const plan = receiptPlan(file);
  if ("error" in plan) return plan;
  if (plan.action === "send") return { file };
  try {
    const blob = await compressImage(file, 2000, 0.8);
    if (blob.size > RECEIPT_MAX_BYTES) return { error: RECEIPT_ERRORS.stillTooBig };
    return { file: new File([blob], "resguardo.webp", { type: "image/webp" }) };
  } catch {
    return { error: RECEIPT_ERRORS.unreadable };
  }
}
