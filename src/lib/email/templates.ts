/** Plantillas de email transaccional en español. Devuelven asunto, HTML y texto plano. */

import { formatDay } from "@/lib/contracts/deposit-tracking";

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Rendered = { subject: string; html: string; text: string };

function layout(
  title: string,
  paragraphs: string[],
  cta: { label: string; url: string },
  footer = "Recibes este email porque tienes una cuenta en Convivo.",
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`).join("");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Convivo</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#7b4b2a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>
<p style="margin:24px 0 0;font-size:13px;color:#57534e">Consejo de seguridad: nunca pagues ni envíes dinero antes de ver la vivienda y firmar un contrato.</p>
</td></tr></table>
<p style="font-size:12px;color:#57534e">${escapeHtml(footer)}</p>
</td></tr></table></body></html>`;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "");

export function newInterestEmail(p: {
  ownerName: string;
  guestName: string;
  listingTitle: string;
  message: string;
  url: string;
}): Rendered {
  const subject = `${p.guestName} está interesado/a en «${p.listingTitle}»`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.ownerName)}:`,
    `<strong>${escapeHtml(p.guestName)}</strong> ha mostrado interés en tu anuncio «${escapeHtml(p.listingTitle)}» y te ha escrito:`,
    `<em>«${escapeHtml(p.message)}»</em>`,
    "Revisa su perfil y sus reseñas antes de responder. Puedes aceptar o rechazar el interés desde la conversación.",
  ];
  return {
    subject,
    html: layout("Nuevo interés en tu anuncio", paragraphs, { label: "Ver la conversación", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nVer la conversación: ${p.url}`,
  };
}

export function interestAcceptedEmail(p: {
  guestName: string;
  ownerName: string;
  listingTitle: string;
  url: string;
}): Rendered {
  const subject = `${p.ownerName} ha aceptado tu interés en «${p.listingTitle}»`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.guestName)}:`,
    `<strong>${escapeHtml(p.ownerName)}</strong> ha aceptado tu interés en «${escapeHtml(p.listingTitle)}». Ya puedes ver la dirección exacta y seguir hablando para organizar una visita.`,
    "Cuando os pongáis de acuerdo, cualquiera de los dos puede proponer la estancia desde la conversación.",
  ];
  return {
    subject,
    html: layout("¡Interés aceptado!", paragraphs, { label: "Abrir la conversación", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nAbrir la conversación: ${p.url}`,
  };
}

export function stayProposedEmail(p: {
  recipientName: string;
  proposerName: string;
  listingTitle: string;
  startDate: string;
  endDate: string | null;
  url: string;
}): Rendered {
  const when = p.endDate ? `del ${p.startDate} al ${p.endDate}` : `a partir del ${p.startDate}`;
  const subject = `${p.proposerName} propone una estancia en «${p.listingTitle}»`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.recipientName)}:`,
    `<strong>${escapeHtml(p.proposerName)}</strong> ha propuesto registrar una estancia en «${escapeHtml(p.listingTitle)}» ${escapeHtml(when)}.`,
    "Confírmala solo si es real: las estancias confirmadas por ambas partes son las que permiten dejar reseñas.",
  ];
  return {
    subject,
    html: layout("Nueva propuesta de estancia", paragraphs, { label: "Revisar la propuesta", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nRevisar la propuesta: ${p.url}`,
  };
}

export function reviewWindowEmail(p: {
  name: string;
  listingTitle: string;
  kind: "opened" | "closing";
  closesAt: string;
  url: string;
}): Rendered {
  const opened = p.kind === "opened";
  const subject = opened
    ? `Ya puedes reseñar tu estancia en «${p.listingTitle}»`
    : `Quedan 3 días para reseñar tu estancia en «${p.listingTitle}»`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    opened
      ? `Se ha abierto la ventana para reseñar tu estancia en «${escapeHtml(p.listingTitle)}». Tienes hasta el ${escapeHtml(p.closesAt)}.`
      : `La ventana para reseñar tu estancia en «${escapeHtml(p.listingTitle)}» se cierra el ${escapeHtml(p.closesAt)}.`,
    "Las reseñas son a doble ciego: nadie verá la tuya hasta que la otra parte opine o pasen 14 días.",
  ];
  return {
    subject,
    html: layout(opened ? "Ya puedes dejar tu reseña" : "Tu ventana de reseña se cierra pronto", paragraphs, {
      label: "Escribir mis reseñas",
      url: p.url,
    }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nEscribir mis reseñas: ${p.url}`,
  };
}

const NOTICE_FOOTER = "Recibes este email porque has enviado una notificación de contenido a Convivo.";

/** Acuse de recibo de una notificación de contenido ilícito (DSA art. 16.4). */
export function noticeReceivedEmail(p: { name: string; reference: string; url: string }): Rendered {
  const subject = `Hemos recibido tu notificación (ref. ${p.reference})`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    `Hemos recibido tu notificación con la referencia <strong>${escapeHtml(p.reference)}</strong>.`,
    "La revisará una persona del equipo en un máximo de 72 horas y te escribiremos con la decisión y sus motivos.",
    "Si el contenido supone un peligro inmediato para alguien, llama al 112.",
  ];
  return {
    subject,
    html: layout("Notificación recibida", paragraphs, { label: "Ir a Convivo", url: p.url }, NOTICE_FOOTER),
    text: `${paragraphs.map(strip).join("\n\n")}`,
  };
}

/** Decisión motivada a quien notificó (DSA art. 16.5). */
export function noticeDecisionEmail(p: { name: string; reference: string; actioned: boolean; note: string; url: string }): Rendered {
  const subject = `Decisión sobre tu notificación (ref. ${p.reference})`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    p.actioned
      ? "Hemos revisado tu notificación y <strong>hemos retirado o restringido el contenido</strong>."
      : "Hemos revisado tu notificación y <strong>no vamos a retirar el contenido</strong>.",
    `Motivo: ${escapeHtml(p.note)}`,
    "Si no estás de acuerdo, responde a este email explicando por qué y lo revisaremos de nuevo.",
  ];
  return {
    subject,
    html: layout("Decisión sobre tu notificación", paragraphs, { label: "Ir a Convivo", url: p.url }, NOTICE_FOOTER),
    text: `${paragraphs.map(strip).join("\n\n")}`,
  };
}

/** Motivación a la persona cuyo contenido se ha retirado (DSA art. 17). */
export function contentRemovedEmail(p: { name: string; what: string; note: string; url: string }): Rendered {
  const subject = `Hemos retirado ${p.what} en Convivo`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    `Hemos retirado ${escapeHtml(p.what)} tras revisar una notificación de otra persona.`,
    `Motivo: ${escapeHtml(p.note)}`,
    "La decisión la ha tomado una persona del equipo, no un sistema automático. Si no estás de acuerdo, responde a este email explicando por qué y la revisaremos de nuevo.",
  ];
  return {
    subject,
    html: layout("Hemos retirado contenido tuyo", paragraphs, { label: "Ir a Convivo", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}`,
  };
}

/** Contrato pendiente de firma para el inquilino. */
export function contractToSignEmail(p: { name: string; landlordName: string; listingTitle: string; url: string }): Rendered {
  const subject = `${p.landlordName} te ha enviado un contrato para firmar`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    `<strong>${escapeHtml(p.landlordName)}</strong> te ha enviado el contrato de «${escapeHtml(p.listingTitle)}» para que lo firmes en Convivo.`,
    "Léelo con calma antes de firmar. Si algo no te cuadra, coméntalo en la conversación: hasta que firméis los dos se puede cancelar y preparar otro.",
  ];
  return {
    subject,
    html: layout("Tienes un contrato para firmar", paragraphs, { label: "Revisar y firmar", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nRevisar y firmar: ${p.url}`,
  };
}

/** Contrato firmado por las dos partes. */
export function contractSignedEmail(p: { name: string; listingTitle: string; url: string }): Rendered {
  const subject = `Contrato firmado: «${p.listingTitle}»`;
  const paragraphs = [
    `Hola, ${escapeHtml(p.name)}:`,
    `El contrato de «${escapeHtml(p.listingTitle)}» ya está firmado por las dos partes y la estancia ha quedado confirmada.`,
    "Descarga una copia y guárdala. Cuando llegue el momento, os avisaremos para que podáis dejar vuestras reseñas.",
  ];
  return {
    subject,
    html: layout("Contrato firmado", paragraphs, { label: "Ver el contrato", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nVer el contrato: ${p.url}`,
  };
}

/** La otra parte ha confirmado el inventario y falta tu confirmación. */
export function inventoryToConfirmEmail(p: { stage: "entry" | "exit"; url: string }): Rendered {
  const label = p.stage === "entry" ? "de entrada" : "de salida";
  const subject = `Tienes un inventario ${label} por revisar`;
  const paragraphs = [
    "Hola:",
    `La otra parte del contrato ha confirmado el inventario ${label} de la vivienda en Convivo.`,
    "Revisa cada elemento y sus fotos. Si estás de acuerdo, confírmalo; si no, corrige lo que haga falta (la otra parte tendrá que volver a confirmarlo). Cuando lo confirméis los dos, ya no se podrá cambiar.",
  ];
  return {
    subject,
    html: layout(`Inventario ${label} por revisar`, paragraphs, { label: "Revisar el inventario", url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\nRevisar el inventario: ${p.url}`,
  };
}

export type DepositEmailKind =
  | "keys_declared"
  | "keys_confirmed"
  | "keys_reminder"
  | "keys_unconfirmed_due"
  | "return_closing"
  | "return_overdue"
  | "return_marked"
  | "return_confirmed"
  | "return_disputed"
  | "settlement_sent"
  | "settlement_answered"
  | "settlement_reopened"
  | "settlement_to_confirm"
  | "settlement_locked";

const DEPOSIT_FOOTNOTE = "Convivo no mueve dinero: solo deja constancia. Información orientativa, borrador pendiente de revisión legal.";

/** Seguimiento de la fianza: un único email con el texto según el aviso y a quién va. */
export function depositEmail(p: {
  kind: DepositEmailKind;
  party: "landlord" | "tenant";
  listingTitle: string;
  url: string;
  /** AAAA-MM-DD */
  keysOn?: string | null;
  dueOn?: string | null;
}): Rendered {
  const t = escapeHtml(p.listingTitle);
  const keys = p.keysOn ? formatDay(p.keysOn) : null;
  const due = p.dueOn ? formatDay(p.dueOn) : null;
  const landlord = p.party === "landlord";
  const copy: Record<DepositEmailKind, { subject: string; title: string; paragraphs: string[]; cta: string }> = {
    keys_declared: {
      subject: "Confirma la entrega de llaves",
      title: "Confirma la entrega de llaves",
      paragraphs: [
        `Tu inquilino declara que entregó las llaves de «${t}»${keys ? ` el ${keys}` : ""}.`,
        "Confírmalo en Convivo, o habladlo en la conversación si la fecha no coincide. Mientras no lo confirmes, constará como declarada por el inquilino y sin confirmar, y empezará a correr el plazo de un mes solo cuando la confirmes.",
      ],
      cta: "Revisar y confirmar",
    },
    keys_confirmed: {
      subject: "Entrega de llaves confirmada: empieza el plazo de la fianza",
      title: "Entrega de llaves confirmada",
      paragraphs: [
        `La entrega de llaves de «${t}»${keys ? ` (${keys})` : ""} está confirmada.`,
        `${due ? `El plazo de un mes para devolver la fianza termina el ${due}.` : "Ya corre el plazo de un mes para devolver la fianza."} Es una indicación orientativa (art. 36.4 LAU).`,
      ],
      cta: "Ver el seguimiento de la fianza",
    },
    keys_reminder: {
      subject: "Recordatorio: confirma la entrega de llaves",
      title: "Falta confirmar la entrega de llaves",
      paragraphs: [
        `Tu inquilino declaró que entregó las llaves de «${t}»${keys ? ` el ${keys}` : ""} y todavía no lo has confirmado.`,
        "Mientras no lo confirmes, consta como «declarada por el inquilino, sin confirmar». Convivo no la da por confirmada. Si la fecha no coincide, habladlo en la conversación.",
      ],
      cta: "Revisar y confirmar",
    },
    keys_unconfirmed_due: {
      subject: landlord ? "Ha pasado un mes desde la fecha de llaves declarada" : "Ya puedes descargar el paquete de pruebas",
      title: landlord ? "Fecha de llaves sin confirmar" : "Paquete de pruebas disponible",
      paragraphs: [
        landlord
          ? `Ha pasado un mes desde la fecha de entrega de llaves de «${t}» que declaró tu inquilino${keys ? ` (${keys})` : ""} y no la has confirmado. Confírmala o habladlo en la conversación.`
          : `Ha pasado un mes desde la fecha de entrega de llaves de «${t}» que declaraste${keys ? ` (${keys})` : ""}. El casero no la ha confirmado.`,
        landlord
          ? "Si la fianza sigue sin devolverse, tu inquilino podrá descargar un paquete de pruebas que indica expresamente que la fecha no está confirmada por ti."
          : "Si no te han devuelto la fianza, puedes descargar el paquete de pruebas desde el contrato. Dirá expresamente que la fecha no fue confirmada por el casero. Convivo no hace ninguna reclamación en tu nombre.",
      ],
      cta: "Ver el seguimiento de la fianza",
    },
    return_closing: {
      subject: "Se acerca el plazo para devolver la fianza",
      title: "Se acerca el plazo de la fianza",
      paragraphs: [
        landlord
          ? `Tienes hasta el ${due ?? "…"} para devolver la fianza de «${t}» (un mes desde la entrega de llaves).`
          : `El plazo para que te devuelvan la fianza de «${t}» termina el ${due ?? "…"}.`,
        landlord ? "Cuando la devuelvas, márcalo en el contrato." : "Cuando la recibas, confírmalo en el contrato.",
      ],
      cta: "Ver el seguimiento de la fianza",
    },
    return_overdue: {
      subject: "Ha vencido el plazo para devolver la fianza",
      title: "Ha vencido el plazo de la fianza",
      paragraphs: [
        `El plazo de un mes para devolver la fianza de «${t}» terminó el ${due ?? "…"}.`,
        landlord
          ? "Si ya la has devuelto, márcalo en el contrato."
          : "Si no la has recibido, puedes descargar desde el contrato un paquete de pruebas en PDF con las fechas, los inventarios y la cronología. Convivo no hace ninguna reclamación en tu nombre.",
      ],
      cta: landlord ? "Marcar la devolución" : "Ver el seguimiento de la fianza",
    },
    return_marked: {
      subject: "Tu casero dice que te ha devuelto la fianza",
      title: "Confirma si has recibido la fianza",
      paragraphs: [`Tu casero ha marcado como devuelta la fianza de «${t}». Confirma si la has recibido o indica que no.`],
      cta: "Responder",
    },
    return_confirmed: {
      subject: "Tu inquilino confirma que ha recibido la fianza",
      title: "Devolución confirmada",
      paragraphs: [`Tu inquilino ha confirmado que ha recibido la fianza de «${t}». El registro ya no se puede cambiar.`],
      cta: "Ver el contrato",
    },
    return_disputed: {
      subject: "Tu inquilino indica que no ha recibido la fianza",
      title: "La fianza consta como no recibida",
      paragraphs: [
        `Tu inquilino indica que no ha recibido la fianza de «${t}». Revisa la devolución con él.`,
        "Cuando la hayas hecho, puedes volver a marcarla en el contrato.",
      ],
      cta: "Ver el contrato",
    },
    settlement_sent: {
      subject: "Tu casero te envía la liquidación de la fianza",
      title: "Liquidación de la fianza",
      paragraphs: [
        `Tu casero ha preparado la liquidación de la fianza de «${t}». Responde a cada partida: acepto o no acepto, con un comentario si quieres.`,
        "Convivo solo deja constancia: no media, no propone cifras ni decide quién tiene razón.",
      ],
      cta: "Ver la liquidación",
    },
    settlement_answered: {
      subject: "Tu inquilino ha respondido a la liquidación de la fianza",
      title: "Respuesta a la liquidación",
      paragraphs: [
        `Tu inquilino ha respondido a las partidas de la liquidación de «${t}».`,
        "Revísala: si hay discrepancias, habladlo en la conversación; podéis reabrirla para cambiarla o confirmarla tal cual para dejar constancia.",
      ],
      cta: "Ver la liquidación",
    },
    settlement_reopened: {
      subject: "Tu casero ha reabierto la liquidación de la fianza",
      title: "Liquidación reabierta",
      paragraphs: [
        `Tu casero ha vuelto a poner en preparación la liquidación de la fianza de «${t}». Te avisaremos cuando te envíe la nueva versión.`,
        "Tus respuestas anteriores quedan en la cronología.",
      ],
      cta: "Ver la liquidación",
    },
    settlement_to_confirm: {
      subject: "Falta tu confirmación de la liquidación de la fianza",
      title: "Falta tu confirmación",
      paragraphs: [
        `La otra parte ya ha confirmado la liquidación de la fianza de «${t}».`,
        "Revísala y confírmala para dejarla cerrada. Confirmar no significa aceptar partidas que se hayan rechazado: solo deja cerrado el registro.",
      ],
      cta: "Revisar y confirmar",
    },
    settlement_locked: {
      subject: "Liquidación de la fianza cerrada",
      title: "Liquidación cerrada",
      paragraphs: [
        `Las dos partes habéis confirmado la liquidación de la fianza de «${t}». Ya no se puede cambiar.`,
        "Desde el contrato podéis descargar el resumen en PDF. Si hay discrepancias, el resumen sirve como constancia.",
      ],
      cta: "Ver el resumen",
    },
  };
  const c = copy[p.kind];
  const paragraphs = ["Hola:", ...c.paragraphs, DEPOSIT_FOOTNOTE];
  return {
    subject: c.subject,
    html: layout(c.title, paragraphs, { label: c.cta, url: p.url }),
    text: `${paragraphs.map(strip).join("\n\n")}\n\n${c.cta}: ${p.url}`,
  };
}
