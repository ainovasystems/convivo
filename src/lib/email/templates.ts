/** Plantillas de email transaccional en español. Devuelven asunto, HTML y texto plano. */

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Rendered = { subject: string; html: string; text: string };

function layout(title: string, paragraphs: string[], cta: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`).join("");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#0f766e">Convivo</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>
<p style="margin:24px 0 0;font-size:13px;color:#57534e">Consejo de seguridad: nunca pagues ni envíes dinero antes de ver la vivienda y firmar un contrato.</p>
</td></tr></table>
<p style="font-size:12px;color:#57534e">Recibes este email porque tienes una cuenta en Convivo.</p>
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
