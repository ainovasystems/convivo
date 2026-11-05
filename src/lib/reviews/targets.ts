import type { ReviewRelationship } from "@/lib/reviews/labels";

/**
 * Espejo en TypeScript de las relaciones que admite el trigger
 * private.reviews_before_insert. Sirve para enseñar qué puede reseñar cada
 * persona; la BD sigue siendo la que decide.
 */
export type ReviewTarget =
  | { subjectType: "listing"; subjectId: string; relationship: "tenant_to_listing" }
  | { subjectType: "user"; subjectId: string; relationship: Exclude<ReviewRelationship, "tenant_to_listing"> };

export type StayForTargets = {
  host_id: string;
  guest_id: string;
  listing_id: string;
  confirmedParticipants: string[];
};

export function reviewTargets(stay: StayForTargets, me: string): ReviewTarget[] {
  const isHost = me === stay.host_id;
  const isGuest = me === stay.guest_id;
  const isMate = stay.confirmedParticipants.includes(me);
  const targets: ReviewTarget[] = [];

  if (isGuest) {
    targets.push({ subjectType: "listing", subjectId: stay.listing_id, relationship: "tenant_to_listing" });
    targets.push({ subjectType: "user", subjectId: stay.host_id, relationship: "tenant_to_landlord" });
  }
  if (isHost) {
    targets.push({ subjectType: "user", subjectId: stay.guest_id, relationship: "landlord_to_tenant" });
  }
  if (isGuest || isMate) {
    const housemates = [stay.guest_id, ...stay.confirmedParticipants].filter((id) => id !== me);
    for (const id of new Set(housemates)) {
      targets.push({ subjectType: "user", subjectId: id, relationship: "flatmate_to_flatmate" });
    }
  }
  return targets;
}

/** Criterios por relación: mismas claves que private.review_criteria_keys. */
export const CRITERIA_BY_RELATIONSHIP: Record<ReviewRelationship, readonly string[]> = {
  tenant_to_listing: ["cleanliness", "accuracy", "area", "condition", "value"],
  tenant_to_landlord: ["communication", "treatment", "compliance", "deposit"],
  landlord_to_tenant: ["payment_punctuality", "home_care", "coexistence", "communication"],
  flatmate_to_flatmate: ["coexistence", "cleanliness", "noise", "respect"],
};

export const RELATIONSHIP_TITLES: Record<ReviewRelationship, string> = {
  tenant_to_listing: "Reseña del inmueble",
  tenant_to_landlord: "Reseña del propietario/a",
  landlord_to_tenant: "Reseña del inquilino/a",
  flatmate_to_flatmate: "Reseña de compañero/a de piso",
};

/** Ayuda contextual de cada criterio (lo que se valora). */
export const CRITERIA_HINTS: Record<string, string> = {
  cleanliness: "¿Estaba limpio como en el anuncio? / ¿Mantiene limpios los espacios comunes?",
  accuracy: "¿Las fotos y la descripción eran fieles?",
  area: "Zona, transporte y servicios cercanos.",
  condition: "Estado de la vivienda, muebles y electrodomésticos.",
  value: "¿Merece lo que cuesta?",
  communication: "Rapidez y claridad al comunicarse.",
  treatment: "Respeto y amabilidad en el trato.",
  compliance: "¿Cumplió lo acordado (reparaciones, contrato…)?",
  deposit: "¿Devolvió la fianza correctamente?",
  payment_punctuality: "¿Pagó a tiempo?",
  home_care: "¿Cuidó la vivienda y los muebles?",
  coexistence: "Convivencia y buen ambiente.",
  noise: "Respeto de los descansos y del silencio.",
  respect: "Respeto hacia las demás personas y sus cosas.",
};
