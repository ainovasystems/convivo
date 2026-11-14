/**
 * Dónde se ofrece cada plantilla de contrato.
 *
 * La plantilla de HABITACIÓN solo existe para Galicia (A Coruña, Lugo, Ourense
 * y Pontevedra). Fuera de Galicia no se prepara contrato de habitación: la
 * estancia y las reseñas funcionan igual (se confirman en el chat). Las
 * plantillas de piso entero (vivienda habitual y temporada) no dependen de la
 * provincia. Decisión del bloque «Correcciones legales» (noviembre de 2026).
 */
export const GALICIA_PROVINCES = ["A Coruña", "Lugo", "Ourense", "Pontevedra"] as const;

/** Provincias cuya regulación de habitaciones ha cambiado recientemente. */
const CHANGED_ROOM_RULES = ["Navarra", "Barcelona", "Girona", "Lleida", "Tarragona"];

export function isGalicia(province: string | null | undefined): boolean {
  return !!province && (GALICIA_PROVINCES as readonly string[]).includes(province);
}

export type ContractAvailability = { available: true } | { available: false; message: string };

/** ¿Se puede preparar un contrato para este anuncio? */
export function contractAvailability(kind: "room" | "flat", province: string | null | undefined): ContractAvailability {
  if (kind !== "room" || isGalicia(province)) return { available: true };
  const changed = !!province && CHANGED_ROOM_RULES.includes(province);
  return {
    available: false,
    message:
      `El contrato de habitación todavía no está disponible fuera de Galicia.${changed ? " La regulación del alquiler de habitaciones en tu comunidad ha cambiado y aún no ofrecemos ese contrato." : ""} ` +
      "Podéis confirmar la estancia desde el chat (sección «Estancia») y las reseñas funcionan igual.",
  };
}
