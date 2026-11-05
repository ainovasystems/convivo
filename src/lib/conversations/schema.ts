import { z } from "zod";

export const interestMessageSchema = z.object({
  listingId: z.uuid(),
  message: z
    .string({ error: "Escribe un mensaje" })
    .trim()
    .min(20, { error: "Cuéntale algo más: mínimo 20 caracteres" })
    .max(500, { error: "Máximo 500 caracteres" }),
});

export const chatMessageSchema = z.object({
  interestId: z.uuid(),
  body: z.string().trim().min(1, { error: "Escribe un mensaje" }).max(2000, { error: "Máximo 2000 caracteres" }),
});

const isoDate = z.iso.date({ error: "Fecha no válida" });

export const proposeStaySchema = z
  .object({
    interestId: z.uuid(),
    startDate: isoDate,
    endDate: z.preprocess((v) => (v === "" || v === null ? undefined : v), isoDate.optional()),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    error: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Acepta el enlace a un perfil de Convivo (…/perfil/<id>) o el id directamente. */
export const participantSchema = z.object({
  stayId: z.uuid(),
  profile: z
    .string()
    .trim()
    .transform((s) => UUID_RE.exec(s)?.[0]?.toLowerCase() ?? "")
    .pipe(z.uuid({ error: "Pega el enlace al perfil de Convivo de tu compañero/a" })),
});
