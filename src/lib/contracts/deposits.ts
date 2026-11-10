import type { Province } from "@/lib/listings/options";

/**
 * Guía ORIENTATIVA del depósito de la fianza (art. 36 LAU) por comunidad
 * autónoma. PENDIENTE DE VERIFICAR con los boletines oficiales y el abogado:
 * se recopiló en noviembre de 2026 a partir de resultados de búsqueda, sin
 * poder abrir las webs oficiales. Las normas cambian a menudo (p. ej.
 * Andalucía lo suprimió en 2026, Navarra lo crea desde 2027 y Cataluña lo
 * extendió a habitaciones en 2026): revisa esta tabla al menos cada año.
 */
export const DEPOSIT_GUIDE_CHECKED = "noviembre de 2026";

export type Ccaa =
  | "Andalucía"
  | "Aragón"
  | "Principado de Asturias"
  | "Illes Balears"
  | "Canarias"
  | "Cantabria"
  | "Castilla-La Mancha"
  | "Castilla y León"
  | "Cataluña"
  | "Comunitat Valenciana"
  | "Extremadura"
  | "Galicia"
  | "Comunidad de Madrid"
  | "Región de Murcia"
  | "Comunidad Foral de Navarra"
  | "País Vasco"
  | "La Rioja"
  | "Ceuta"
  | "Melilla";

export const PROVINCE_CCAA: Record<Province, Ccaa> = {
  Almería: "Andalucía", Cádiz: "Andalucía", Córdoba: "Andalucía", Granada: "Andalucía", Huelva: "Andalucía",
  Jaén: "Andalucía", Málaga: "Andalucía", Sevilla: "Andalucía",
  Huesca: "Aragón", Teruel: "Aragón", Zaragoza: "Aragón",
  Asturias: "Principado de Asturias",
  "Illes Balears": "Illes Balears",
  "Las Palmas": "Canarias", "Santa Cruz de Tenerife": "Canarias",
  Cantabria: "Cantabria",
  Albacete: "Castilla-La Mancha", "Ciudad Real": "Castilla-La Mancha", Cuenca: "Castilla-La Mancha",
  Guadalajara: "Castilla-La Mancha", Toledo: "Castilla-La Mancha",
  Ávila: "Castilla y León", Burgos: "Castilla y León", León: "Castilla y León", Palencia: "Castilla y León",
  Salamanca: "Castilla y León", Segovia: "Castilla y León", Soria: "Castilla y León", Valladolid: "Castilla y León",
  Zamora: "Castilla y León",
  Barcelona: "Cataluña", Girona: "Cataluña", Lleida: "Cataluña", Tarragona: "Cataluña",
  Alicante: "Comunitat Valenciana", Castellón: "Comunitat Valenciana", Valencia: "Comunitat Valenciana",
  Badajoz: "Extremadura", Cáceres: "Extremadura",
  "A Coruña": "Galicia", Lugo: "Galicia", Ourense: "Galicia", Pontevedra: "Galicia",
  Madrid: "Comunidad de Madrid",
  Murcia: "Región de Murcia",
  Navarra: "Comunidad Foral de Navarra",
  Álava: "País Vasco", Bizkaia: "País Vasco", Gipuzkoa: "País Vasco",
  "La Rioja": "La Rioja",
  Ceuta: "Ceuta",
  Melilla: "Melilla",
};

/** yes = también habitaciones; no = las habitaciones no se depositan; unclear = no consta. */
export type RoomRule = "yes" | "no" | "unclear";

export type DepositRule = {
  /** false: hoy no hay que depositarla en ningún organismo. null: no hemos podido confirmarlo. */
  required: boolean | null;
  organism?: string;
  deadline?: string;
  how?: string;
  rooms: RoomRule;
  roomsNote?: string;
  law?: string;
  url?: string;
  note?: string;
};

const MIVAU = "https://www.mivau.gob.es/vivienda/alquila-bien-es-tu-derecho/alquiler/deposito-de-fianzas";

export const DEPOSIT_RULES: Record<Ccaa, DepositRule> = {
  Andalucía: {
    required: false,
    rooms: "no",
    law: "Ley 5/2025 de Vivienda de Andalucía, disp. adicional sexta",
    url: "https://juntadeandalucia.es/boja/2025/247/1",
    note: "Desde el 24 de enero de 2026 ya no se deposita. Las fianzas depositadas antes las sigue devolviendo AVRA.",
  },
  Aragón: {
    required: true,
    organism: "Gobierno de Aragón (gestión de fianzas de arrendamientos)",
    deadline: "2 meses desde la firma del contrato",
    how: "Trámite electrónico en aragon.es.",
    rooms: "no",
    roomsNote: "Según la ficha del trámite, las habitaciones y los contratos de temporada no se depositan.",
    law: "Ley 10/1992 de fianzas de arrendamientos",
    url: "https://www.aragon.es/tramitador/-/tramite/gestion-de-fianzas-de-arrendamientos-en-regimen-general/deposito",
  },
  "Principado de Asturias": {
    required: false,
    rooms: "no",
    law: "Decreto 48/2010, que suprime el depósito",
    url: MIVAU,
    note: "Hay una ley de vivienda en tramitación que podría volver a exigirlo.",
  },
  "Illes Balears": {
    required: true,
    organism: "IBAVI (lo gestiona el Col·legi d'Administradors de Finques)",
    deadline: "30 días hábiles desde la firma, según el IBAVI",
    how: "Telemático, con el modelo F1 y el contrato firmado.",
    rooms: "unclear",
    law: "Ley 5/2018 de vivienda; Decreto 22/1989",
    url: "https://www.caib.es/sites/informaciohabitatge/es/ingresar_fianzas",
  },
  Canarias: {
    required: true,
    organism: "Instituto Canario de la Vivienda (Caja General de Depósitos del Gobierno de Canarias)",
    deadline: "1 mes desde la firma (por confirmar)",
    how: "Alta como tercero acreedor y solicitud de ingreso por la sede electrónica. Gratuito.",
    rooms: "unclear",
    law: "Ley 2/2003 de Vivienda de Canarias",
    url: "https://www.gobiernodecanarias.org/vivienda/destacados/Fianzas_V2.html",
  },
  Cantabria: {
    required: false,
    rooms: "no",
    law: "Ley 9/2017 de Medidas Fiscales y Administrativas, art. 16",
    url: "https://www.hacienda.gob.es/DocLeyes/repositorio%20normativa/57667.htm",
    note: "El depósito se suprimió en 2017.",
  },
  "Castilla-La Mancha": {
    required: true,
    organism: "Junta de Comunidades de Castilla-La Mancha (Depósito de Fianzas)",
    deadline: "30 días hábiles desde el día siguiente a la firma",
    how: "Modelo del portal de Vivienda; pago telemático o en entidad colaboradora.",
    rooms: "unclear",
    law: "Decreto 6/2022",
    url: "https://vivienda.castillalamancha.es/regimen-general",
  },
  "Castilla y León": {
    required: true,
    organism: "Junta de Castilla y León, a través de la Cámara de la Propiedad Urbana de cada provincia",
    deadline: "1 mes desde la firma",
    how: "Ingreso en la Cámara de la Propiedad Urbana de la provincia. Gratuito.",
    rooms: "unclear",
    law: "Ley 9/2010 del derecho a la vivienda, arts. 36-42",
  },
  Cataluña: {
    required: true,
    organism: "INCASÒL (Institut Català del Sòl)",
    deadline: "2 meses desde la firma",
    how: "Online, en el trámite «Dipòsit de fiances» del INCASÒL. Fuera de plazo hay recargo.",
    rooms: "yes",
    roomsNote: "Obligatorio también en habitaciones para contratos firmados desde el 14 de julio de 2026.",
    law: "Llei 13/1996; Decret 147/1997",
    url: "https://incasol.gencat.cat/es/serveis-i-tramits/fiances-de-lloguers/informacio/preguntes-mes-frequeents",
  },
  "Comunitat Valenciana": {
    required: true,
    organism: "Generalitat Valenciana (Tesorería, Conselleria de Hacienda)",
    deadline: "1 mes desde la firma (o desde el inicio, si fue antes)",
    how: "Autoliquidación: modelo 816 por internet u 806 en entidad colaboradora.",
    rooms: "unclear",
    law: "Ley 8/2004 de vivienda; Decreto 46/2022",
    url: "https://hisenda.gva.es/es/web/tesoreria/faq-diposit-sobre-fiances",
  },
  Extremadura: {
    required: false,
    rooms: "no",
    url: MIVAU,
    note: "No hay procedimiento autonómico de depósito.",
  },
  Galicia: {
    required: true,
    organism: "IGVS (Instituto Galego da Vivenda e Solo)",
    deadline: "1 mes desde la firma",
    how: "Desde la web del IGVS o la sede de la Xunta. Entrega al inquilino copia del justificante en un mes.",
    rooms: "yes",
    roomsNote: "Incluye las habitaciones. Exentos los alquileres de temporada de un mes o menos.",
    law: "Ley 8/2012 de vivienda de Galicia; Decreto 42/2011",
    url: "https://igvs.xunta.gal/es/deposito-de-fianzas",
  },
  "Comunidad de Madrid": {
    required: true,
    organism: "Agencia de Vivienda Social de la Comunidad de Madrid",
    deadline: "30 días hábiles desde la firma",
    how: "Autoliquidación gratuita en la sede electrónica o en el banco. Fuera de plazo, recargo del 2 % al 5 %.",
    rooms: "unclear",
    law: "Ley 12/1997; Decreto 181/1996",
    url: "https://sede.comunidad.madrid/impuestos-tasas-precios-publicos/deposito-fianzas-regimen-general",
  },
  "Región de Murcia": {
    required: false,
    rooms: "no",
    law: "Decreto-Ley 1/2021, que modifica la Ley 6/2015 de Vivienda",
    url: "https://sede.carm.es/web/procedimiento/479",
    note: "Suprimido en mayo de 2021. Las fianzas anteriores se devuelven por el procedimiento 479.",
  },
  "Comunidad Foral de Navarra": {
    required: false,
    rooms: "unclear",
    law: "Ley Foral 10/2010, art. 96 ter (Ley Foral 9/2025); Ley Foral 11/2026 de habitaciones",
    note: "Hoy no se deposita, pero será obligatorio desde el 1 de enero de 2027 cuando se apruebe el reglamento. Los contratos de habitación se inscriben en el registro desde julio de 2026.",
  },
  "País Vasco": {
    required: true,
    organism: "Gobierno Vasco, Departamento de Vivienda (Bizilagun)",
    deadline: "1 mes desde la firma",
    how: "Formulario online o presencial y hoja de liquidación. Gratuito; fuera de plazo, recargo.",
    rooms: "no",
    roomsNote: "No es obligatorio en habitaciones, trasteros ni garajes.",
    law: "Ley 3/2015 de Vivienda; Decreto 42/2016",
    url: "https://www.euskadi.eus/fianzas/web01-tramite/es/",
  },
  "La Rioja": {
    required: false,
    rooms: "no",
    url: MIVAU,
    note: "No hay obligación de depósito autonómico.",
  },
  Ceuta: {
    required: null,
    rooms: "unclear",
    url: MIVAU,
    note: "No hemos podido confirmarlo. Pregunta en EMVICESA (Empresa Municipal de la Vivienda de Ceuta).",
  },
  Melilla: {
    required: null,
    rooms: "unclear",
    url: MIVAU,
    note: "No hemos podido confirmarlo. Pregunta en EMVISMESA (Empresa Municipal de la Vivienda y Suelo de Melilla).",
  },
};

export function depositRuleFor(province: string | null | undefined) {
  if (!province || !(province in PROVINCE_CCAA)) return null;
  const ccaa = PROVINCE_CCAA[province as Province];
  return { ccaa, rule: DEPOSIT_RULES[ccaa] };
}
