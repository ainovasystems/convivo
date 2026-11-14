import { isGalicia } from "@/lib/contracts/availability";

/**
 * Guía ORIENTATIVA de la fianza (art. 36 LAU). Solo tiene dos versiones:
 * Galicia y «resto de España». No hay datos por comunidad autónoma: las normas
 * cambian a menudo y no hemos podido verificarlas, así que fuera de Galicia el
 * texto es genérico y manda a consultar el organismo de vivienda de la
 * comunidad. PENDIENTE DE REVISIÓN LEGAL (pregunta (d) al abogado).
 *
 * Lo que figura en la norma gallega (Decreto 42/2011, IGVS): el depósito se
 * hace en el Instituto Galego da Vivenda e Solo (IGVS), es gratuito y no
 * devenga intereses, y el arrendador debe entregar al inquilino copia del
 * justificante en el plazo de un mes. NO está confirmado el plazo de un mes
 * para depositar (viene de fuentes secundarias) ni que la obligación alcance
 * a las habitaciones: el texto lo dice así.
 */
export type DepositGuideVersion = "galicia" | "other";

export type DepositGuide = {
  version: DepositGuideVersion;
  title: string;
  /** Párrafos de información. */
  paragraphs: string[];
  /** Cosas que NO están confirmadas, dichas con claridad. */
  unconfirmed: string[];
  /** Siempre presente. */
  notice: string;
  law?: string;
  url?: string;
};

export const DEPOSIT_NOTICE =
  "Información orientativa y pendiente de revisión legal: consulta el organismo de vivienda (en Galicia, el IGVS) antes de hacer el trámite.";

const GALICIA_GUIDE: DepositGuide = {
  version: "galicia",
  title: "Fianza en Galicia",
  paragraphs: [
    "En Galicia, la fianza se deposita en el Instituto Galego da Vivenda e Solo (IGVS). El depósito es gratuito y no genera intereses.",
    "La parte arrendadora debe entregar a la parte arrendataria una copia del justificante del depósito en el plazo de un mes.",
  ],
  unconfirmed: [
    "El plazo de un mes para hacer el depósito viene de fuentes secundarias y no lo hemos confirmado en la norma.",
    "Tampoco hemos confirmado que la obligación alcance a los alquileres de habitaciones.",
  ],
  notice: DEPOSIT_NOTICE,
  law: "Decreto 42/2011 (Xunta de Galicia)",
  url: "https://igvs.xunta.gal/es/deposito-de-fianzas",
};

const OTHER_GUIDE: DepositGuide = {
  version: "other",
  title: "Fianza fuera de Galicia",
  paragraphs: [
    "La fianza se deposita en el organismo de vivienda de tu comunidad autónoma. En algunas comunidades no es obligatorio depositarla. Consúltalo allí: no tenemos datos por comunidad.",
  ],
  unconfirmed: [],
  notice: DEPOSIT_NOTICE,
};

/** Versión de la guía que corresponde a la provincia del anuncio. */
export function depositGuideFor(province: string | null | undefined): DepositGuide {
  return isGalicia(province) ? GALICIA_GUIDE : OTHER_GUIDE;
}

/** Plazo de devolución al terminar el contrato (art. 36.4 LAU). */
export const DEPOSIT_RETURN_TEXT =
  "Al terminar, se devuelve en el plazo de un mes desde la entrega de llaves. Si se retrasa, genera el interés legal (art. 36.4 LAU).";
