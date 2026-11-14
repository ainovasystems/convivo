import { CONTRACT_KIND_LABELS, TEMPLATE_VERSION, type ContractKind, type ContractTerms } from "@/lib/contracts/schema";

/**
 * Plantillas de contrato. BORRADOR PENDIENTE DE REVISIÓN LEGAL: el texto lo
 * tiene que revisar un abogado de arrendamientos antes de usarse con usuarios
 * reales. Si cambias el texto, cambia TEMPLATE_VERSION.
 *
 * El resultado es texto plano determinista: es lo que se guarda al enviar
 * (contracts.document_text), se sella con su hash y se firma tal cual.
 */

export type ContractSection = { heading: string; paragraphs: string[] };
export type ContractDocument = { title: string; sections: ContractSection[] };

const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/** Línea en blanco para rellenar a mano: Convivo no pide ni guarda el DNI/NIE. */
const ID_BLANK = "____________________";

export const DRAFT_NOTICE =
  "BORRADOR DE PLANTILLA PENDIENTE DE REVISIÓN LEGAL. Convivo facilita este modelo, pero no presta asesoramiento jurídico ni es parte del contrato. Revisadlo antes de firmar.";

export function renderContract(
  kind: ContractKind,
  t: ContractTerms,
  meta: { city: string | null; contractId: string; landlordId: string; tenantId: string },
): ContractDocument {
  const place = meta.city ?? "la localidad de la vivienda";
  const isRoom = kind === "room";
  const object = isRoom
    ? `una habitación${t.room_description ? ` (${t.room_description})` : ""} de la vivienda situada en ${t.address}, con derecho al uso compartido de las zonas comunes (cocina, salón, baño y demás espacios comunes)`
    : `la vivienda situada en ${t.address}`;

  const duration = (() => {
    if (kind === "flat_habitual") {
      return [
        `El contrato empieza el ${longDate(t.start_date)} y tiene una duración de un año.`,
        "Llegado el vencimiento, se prorrogará obligatoriamente por plazos anuales hasta que el arrendamiento alcance una duración mínima de cinco años, salvo que la parte arrendataria manifieste con al menos treinta días de antelación su voluntad de no renovarlo, en los términos del artículo 9 de la Ley de Arrendamientos Urbanos.",
        "La parte arrendataria podrá desistir del contrato una vez transcurridos al menos seis meses, avisando con una antelación mínima de treinta días (artículo 11 de la Ley de Arrendamientos Urbanos).",
      ];
    }
    if (kind === "flat_seasonal") {
      return [
        `El arrendamiento es de temporada y no de vivienda habitual. Se celebra por el siguiente motivo: ${t.seasonal_reason}.`,
        `Empieza el ${longDate(t.start_date)} y termina el ${longDate(t.end_date ?? t.start_date)}, sin prórroga automática. Al terminar, la parte arrendataria dejará la vivienda libre y en el mismo estado en que la recibió.`,
      ];
    }
    return [
      `El contrato empieza el ${longDate(t.start_date)}${t.end_date ? ` y termina el ${longDate(t.end_date)}` : " y tiene duración indefinida"}.`,
      "Cualquiera de las partes podrá ponerle fin avisando por escrito con una antelación mínima de treinta días.",
    ];
  })();

  const law = (() => {
    if (kind === "flat_habitual") {
      return "Este contrato se rige por el Título II de la Ley 29/1994, de Arrendamientos Urbanos (arrendamiento de vivienda), por lo pactado por las partes en lo que la ley permita y, supletoriamente, por el Código Civil.";
    }
    if (kind === "flat_seasonal") {
      return "Este contrato es un arrendamiento para uso distinto del de vivienda (temporada) y se rige por la voluntad de las partes, por el Título III de la Ley 29/1994, de Arrendamientos Urbanos, y supletoriamente por el Código Civil.";
    }
    return "Este contrato de arrendamiento de habitación en vivienda compartida se rige por la voluntad de las partes y por los artículos 1542 y siguientes del Código Civil. [Revisar con el abogado si, según el caso, resulta aplicable la Ley de Arrendamientos Urbanos].";
  })();

  const depositText = (() => {
    if (t.deposit === 0) return "Las partes acuerdan que no se entrega fianza.";
    const legal =
      kind === "flat_habitual"
        ? " La fianza legal es de una mensualidad (artículo 36 de la Ley de Arrendamientos Urbanos); el importe que la supere tiene la consideración de garantía adicional."
        : kind === "flat_seasonal"
          ? " La fianza legal en este tipo de arrendamiento es de dos mensualidades (artículo 36 de la Ley de Arrendamientos Urbanos)."
          : "";
    const depositAt = isRoom
      ? ""
      : " La parte arrendadora depositará la fianza en el organismo que corresponda de su comunidad autónoma, conforme a su normativa.";
    return `La parte arrendataria entrega a la firma ${euros(t.deposit)} en concepto de fianza.${legal}${depositAt} Se devolverá al terminar el contrato, en el plazo de un mes desde la entrega de llaves, descontando, en su caso, los daños causados o las cantidades pendientes de pago, debidamente justificados.`;
  })();

  const sections: ContractSection[] = [
    { heading: "Aviso", paragraphs: [DRAFT_NOTICE] },
    {
      heading: "Reunidos",
      paragraphs: [
        `En ${place}, en la fecha de la última firma electrónica que figura al final de este documento.`,
        `De una parte, como PARTE ARRENDADORA, ${t.landlord_name}, usuario de Convivo con identificador ${meta.landlordId}.`,
        `De otra parte, como PARTE ARRENDATARIA, ${t.tenant_name}, usuario de Convivo con identificador ${meta.tenantId}.`,
        `DNI/NIE de la parte arrendadora: ${ID_BLANK}`,
        `DNI/NIE de la parte arrendataria: ${ID_BLANK}`,
        "El DNI/NIE de cada parte lo completa ella misma, a mano, al presentar el trámite de la fianza si procede. Convivo no lo recoge ni lo guarda.",
        "Ambas partes se reconocen capacidad legal suficiente para celebrar este contrato y declaran que los datos que constan en él son ciertos. [Revisar con el abogado si deben constar documento de identidad y domicilio de las partes].",
      ],
    },
    {
      heading: "Primera. Objeto",
      paragraphs: [
        `La parte arrendadora alquila a la parte arrendataria ${object}, ${t.furnished ? "amueblada y equipada" : "sin amueblar"}, para su uso exclusivo como ${kind === "flat_seasonal" ? "residencia temporal" : "vivienda"}.`,
      ],
    },
    { heading: "Segunda. Duración", paragraphs: duration },
    {
      heading: "Tercera. Renta",
      paragraphs: [
        `La renta es de ${euros(t.monthly_rent)} al mes, que se pagará por meses anticipados dentro de los ${t.payment_day} primeros días de cada mes, por transferencia bancaria a la cuenta que indique la parte arrendadora.`,
        kind === "flat_habitual"
          ? "La renta solo podrá actualizarse en los términos y con los límites que establezcan la Ley de Arrendamientos Urbanos y la normativa vigente en cada momento."
          : "La renta no se actualizará durante la vigencia del contrato, salvo acuerdo por escrito entre las partes.",
      ],
    },
    {
      heading: "Cuarta. Gastos y suministros",
      paragraphs: [
        t.bills_included
          ? `La renta incluye los gastos de suministros (agua, luz, gas e internet)${t.bills_note ? `: ${t.bills_note}` : ""}.`
          : `Los gastos de suministros no están incluidos en la renta y corren a cargo de la parte arrendataria${t.bills_note ? ` en la siguiente forma: ${t.bills_note}` : " según su consumo"}.`,
        "Los gastos de gestión inmobiliaria y de formalización del contrato, si los hubiera, son a cargo de la parte arrendadora.",
      ],
    },
    { heading: "Quinta. Fianza", paragraphs: [depositText] },
    {
      heading: "Sexta. Conservación y uso",
      paragraphs: [
        "La parte arrendataria cuidará la vivienda con diligencia y se hará cargo de las pequeñas reparaciones que exija el desgaste por el uso ordinario. Las reparaciones necesarias para conservar la vivienda en condiciones de habitabilidad corresponden a la parte arrendadora.",
        "La parte arrendataria no podrá realizar obras sin el consentimiento por escrito de la parte arrendadora, ni subarrendar o ceder el contrato sin su consentimiento por escrito.",
        "La parte arrendadora solo podrá acceder a la vivienda o a la habitación con el consentimiento de la parte arrendataria, salvo urgencia justificada.",
      ],
    },
    ...(t.house_rules
      ? [{ heading: "Séptima. Normas de convivencia", paragraphs: [t.house_rules] }]
      : []),
    ...(t.extra_clauses
      ? [{ heading: "Cláusulas adicionales pactadas por las partes", paragraphs: [t.extra_clauses] }]
      : []),
    {
      heading: "Inventario y estado",
      paragraphs: [
        "Las partes podrán documentar el estado de la vivienda y el mobiliario con fotografías fechadas al inicio del contrato. A falta de inventario, se presume que la parte arrendataria recibe la vivienda en buen estado.",
      ],
    },
    { heading: "Ley aplicable", paragraphs: [law] },
    {
      heading: "Firma electrónica",
      paragraphs: [
        "Las partes firman este contrato electrónicamente en Convivo escribiendo su nombre completo. Convivo deja constancia de la fecha y hora de cada firma y de la huella digital (SHA-256) del texto firmado, de modo que cualquier cambio posterior del texto se puede detectar. Cada parte puede descargar una copia.",
        `Tipo de contrato: ${CONTRACT_KIND_LABELS[kind]}. Plantilla ${TEMPLATE_VERSION}. Referencia ${meta.contractId}.`,
      ],
    },
  ];

  const title = isRoom
    ? "CONTRATO DE ARRENDAMIENTO DE HABITACIÓN EN VIVIENDA COMPARTIDA"
    : kind === "flat_habitual"
      ? "CONTRATO DE ARRENDAMIENTO DE VIVIENDA"
      : "CONTRATO DE ARRENDAMIENTO DE TEMPORADA";
  return { title, sections };
}

/** Texto plano canónico (lo que se guarda, se sella y se firma). */
export function contractToText(doc: ContractDocument): string {
  return [doc.title, ...doc.sections.map((s) => [s.heading.toUpperCase(), ...s.paragraphs].join("\n\n"))].join("\n\n\n");
}

/** Para mostrar un texto guardado: bloques separados por línea en blanco. */
export function textToBlocks(text: string) {
  return text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
}
