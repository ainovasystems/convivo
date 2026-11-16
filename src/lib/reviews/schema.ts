import { z } from "zod";

import { personalDataError } from "@/lib/moderation/personal-data";
import { CRITERIA_BY_RELATIONSHIP } from "@/lib/reviews/targets";

const RELATIONSHIPS = ["tenant_to_listing", "tenant_to_landlord", "landlord_to_tenant", "flatmate_to_flatmate"] as const;
const score = z.coerce.number({ error: "Elige una puntuación" }).int().min(1, { error: "Elige una puntuación" }).max(5);

export const reviewSchema = z
  .object({
    stayId: z.uuid(),
    subjectType: z.enum(["listing", "user"]),
    subjectId: z.uuid(),
    relationship: z.enum(RELATIONSHIPS),
    rating: score,
    criteria: z.record(z.string(), score),
    body: z
      .string({ error: "Escribe tu reseña" })
      .trim()
      .min(50, { error: "Cuenta un poco más: mínimo 50 caracteres" })
      .max(1500, { error: "Máximo 1500 caracteres" }),
  })
  .superRefine((d, ctx) => {
    const personal = personalDataError(d.body, "review");
    if (personal) ctx.addIssue({ code: "custom", path: ["body"], message: personal });
    const expected = CRITERIA_BY_RELATIONSHIP[d.relationship];
    for (const key of expected) {
      if (d.criteria[key] === undefined) {
        ctx.addIssue({ code: "custom", path: ["criteria", key], message: "Elige una puntuación" });
      }
    }
    for (const key of Object.keys(d.criteria)) {
      if (!expected.includes(key)) {
        ctx.addIssue({ code: "custom", path: ["criteria", key], message: "Criterio no válido" });
      }
    }
    if ((d.subjectType === "listing") !== (d.relationship === "tenant_to_listing")) {
      ctx.addIssue({ code: "custom", path: ["relationship"], message: "Relación no válida" });
    }
  });

export type ReviewInput = z.infer<typeof reviewSchema>;

/** FormData del formulario de reseña -> objeto para el esquema. */
export function reviewFormDataToObject(fd: FormData) {
  const criteria: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("criteria.") && typeof value === "string" && value !== "") {
      criteria[key.slice("criteria.".length)] = value;
    }
  }
  return {
    stayId: fd.get("stayId"),
    subjectType: fd.get("subjectType"),
    subjectId: fd.get("subjectId"),
    relationship: fd.get("relationship"),
    rating: fd.get("rating") || undefined,
    criteria,
    body: fd.get("body"),
  };
}

export const responseSchema = z.object({
  reviewId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(10, { error: "Mínimo 10 caracteres" })
    .max(1000, { error: "Máximo 1000 caracteres" })
    .superRefine((v, ctx) => {
      const message = personalDataError(v, "review");
      if (message) ctx.addIssue({ code: "custom", message });
    }),
});

export const REPORT_REASONS = {
  personal_data: "Contiene datos personales, también sensibles, de terceros (teléfono, dirección, DNI, salud, religión, origen, orientación sexual, ideología, antecedentes penales…)",
  offensive: "Lenguaje ofensivo o insultos",
  false_information: "Información falsa",
  discrimination: "Discriminación",
  spam: "Spam o publicidad",
  other: "Otro motivo",
} as const;

export const reportReviewSchema = z.object({
  reviewId: z.uuid(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...Array<keyof typeof REPORT_REASONS>], {
    error: "Elige un motivo",
  }),
  details: z.string().trim().max(1000, { error: "Máximo 1000 caracteres" }).optional(),
});
