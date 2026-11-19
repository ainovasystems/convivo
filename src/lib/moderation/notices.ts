import { z } from "zod";

/** Motivos de una notificación de contenido ilícito (DSA art. 16). Iguales que el CHECK de legal_notices. */
export const NOTICE_REASONS = {
  defamation: "Difamación o acusaciones falsas",
  personal_data: "Datos personales míos o de otra persona (también sensibles: salud, religión, origen, orientación sexual…)",
  discrimination: "Discriminación",
  fraud: "Estafa o fraude",
  minor: "La cuenta es de un menor",
  intellectual_property: "Fotos o textos copiados (propiedad intelectual)",
  threat: "Amenazas o peligro para alguien",
  other_illegal: "Otro contenido ilegal",
} as const;
export type NoticeReason = keyof typeof NOTICE_REASONS;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Deduce qué se notifica a partir del enlace pegado: /anuncios/{id} → anuncio,
 * /perfil/{id} → perfil. Las reseñas llegan con ?resena={id} desde su botón.
 */
export function parseNoticeTarget(url: string, reviewId?: string | null) {
  if (reviewId && new RegExp(`^${UUID}$`).test(reviewId)) return { type: "review" as const, id: reviewId };
  let path = url.trim();
  try {
    path = new URL(path, "https://convivo.local").pathname;
  } catch {
    return { type: "other" as const, id: null };
  }
  const listing = path.match(new RegExp(`^/anuncios/(${UUID})/?$`, "i"));
  if (listing) return { type: "listing" as const, id: listing[1].toLowerCase() };
  const profile = path.match(new RegExp(`^/perfil/(${UUID})/?$`, "i"));
  if (profile) return { type: "profile" as const, id: profile[1].toLowerCase() };
  return { type: "other" as const, id: null };
}

/** Dominios de Hommie que siempre valen. A ellos se suma el de la web que atiende la petición (la de pruebas). */
export const HOMMIE_HOSTS = ["hommie.es", "www.hommie.es"] as const;

/** Dominios admitidos: los de Hommie y el de la propia web (p. ej. la de pruebas o localhost). */
export function noticeAllowedHosts(siteUrl?: string | null): string[] {
  const hosts = new Set<string>(HOMMIE_HOSTS);
  try {
    if (siteUrl) hosts.add(new URL(siteUrl).host.toLowerCase());
  } catch {
    // Sin URL de la web válida, solo valen los dominios de Hommie.
  }
  return [...hosts];
}

export const NOTICE_URL_MISSING = "Pega el enlace del contenido";
export const NOTICE_URL_NOT_A_LINK =
  "Eso no es un enlace. Copia la dirección completa de la página de Hommie que quieres notificar (empieza por https://).";
export const noticeUrlForeignMessage = (host: string) =>
  `Ese enlace no es de Hommie. Aquí solo se pueden notificar anuncios, perfiles y reseñas de Hommie: copia la dirección de su página (empieza por https://${host}/).`;

/**
 * Comprueba el enlace de una notificación (auditoría I13): tiene que ser un
 * enlace http(s) a un dominio de Hommie. Se usa en el formulario y, la que
 * manda, en el servidor. Devuelve el enlace normalizado o el mensaje de error.
 */
export function checkNoticeUrl(input: string, allowedHosts: readonly string[]): { ok: true; url: string } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: NOTICE_URL_MISSING };
  if (text.length > 500) return { ok: false, error: "Enlace demasiado largo" };
  if (/\s/.test(text)) return { ok: false, error: NOTICE_URL_NOT_A_LINK };
  // Se admite sin «https://» si empieza por un dominio (hommie.es/anuncios/…).
  const withScheme = /^https?:\/\//i.test(text) ? text : /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?(\/|$)/i.test(text) ? `https://${text}` : null;
  if (!withScheme) return { ok: false, error: NOTICE_URL_NOT_A_LINK };
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: NOTICE_URL_NOT_A_LINK };
  }
  if (!allowedHosts.includes(url.host.toLowerCase()) || url.username || url.password) {
    return { ok: false, error: noticeUrlForeignMessage(allowedHosts.find((h) => !HOMMIE_HOSTS.includes(h as never)) ?? HOMMIE_HOSTS[0]) };
  }
  // Se guarda el enlace ya interpretado, no el texto tal como se tecleó.
  return { ok: true, url: url.href };
}

/** Para los enlaces internos «Notificar…», que llegan como ruta (/anuncios/…): la dirección completa. */
export function absoluteNoticeUrl(url: string, siteUrl: string) {
  return url.startsWith("/") && !url.startsWith("//") ? `${siteUrl.replace(/\/$/, "")}${url}` : url;
}

export const noticeSchema = z.object({
  // El enlace se comprueba aparte con checkNoticeUrl (depende del dominio de la web).
  url: z.string().trim().min(1, { error: NOTICE_URL_MISSING }).max(500, { error: "Enlace demasiado largo" }),
  reviewId: z.string().trim().optional(),
  reason: z.enum(Object.keys(NOTICE_REASONS) as [NoticeReason, ...NoticeReason[]], { error: "Elige un motivo" }),
  explanation: z
    .string()
    .trim()
    .min(30, { error: "Explica qué es ilícito y por qué (mínimo 30 caracteres)" })
    .max(3000, { error: "Máximo 3000 caracteres" }),
  name: z.string().trim().min(2, { error: "Escribe tu nombre" }).max(120),
  email: z.email({ error: "Escribe un email válido: te enviaremos el acuse y la decisión" }).max(200),
  goodFaith: z.literal("on", { error: "Tienes que confirmar que la información es correcta" }),
});

export const NOTICE_DECISIONS = { actioned: "Retirado o restringido", rejected: "No se retira" } as const;
