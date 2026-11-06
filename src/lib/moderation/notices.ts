import { z } from "zod";

/** Motivos de una notificación de contenido ilícito (DSA art. 16). Iguales que el CHECK de legal_notices. */
export const NOTICE_REASONS = {
  defamation: "Difamación o acusaciones falsas",
  personal_data: "Datos personales míos o de otra persona",
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

export const noticeSchema = z.object({
  url: z.string().trim().min(5, { error: "Pega el enlace del contenido" }).max(500, { error: "Enlace demasiado largo" }),
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
