/** Plantillas de email transaccional en español. Devuelven asunto, HTML y texto plano. */

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
