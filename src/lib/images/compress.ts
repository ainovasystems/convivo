/** Tamaño final para que el lado mayor no pase de `max` (sin ampliar nunca). */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla:
 * lado mayor ≤ 1600 px, formato WebP. Respeta la orientación EXIF.
 * Además elimina los metadatos (p. ej. la ubicación GPS de la foto).
 */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("No se pudo comprimir la imagen");
  return blob;
}
