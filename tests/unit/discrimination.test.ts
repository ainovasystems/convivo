import { describe, expect, it } from "vitest";

import { findDiscriminatoryTerms, hasGenderRestriction, normalizeForMatching } from "@/lib/listings/discrimination";
import { listingDraftSchema, publishErrors, publishWarnings } from "@/lib/listings/schema";

describe("normalización", () => {
  it("quita mayúsculas, tildes, signos y espacios de más", () => {
    expect(normalizeForMatching("  ¡SÓLO   Españoles!! ")).toBe("solo espanoles");
  });
});

describe("expresiones discriminatorias", () => {
  it.each([
    "Solo españoles",
    "SÓLO ESPAÑOLES, gracias",
    "Habitación para gente nacional únicamente: solo nacionales",
    "Preferiblemente españolas",
    "solo para chicos españoles",
    "No extranjeros",
    "sin inmigrantes, por favor",
    "Abstenerse gitanos",
    "Extranjeros abstenerse",
    "No se admiten musulmanes",
    "solo cristianos practicantes",
    "No latinos ni árabes",
    "nada de moros",
    "Se requiere nacionalidad española",
    "no gays",
    "Sólo   católicos",
  ])("rechaza «%s»", (text) => {
    expect(findDiscriminatoryTerms(text)).not.toEqual([]);
  });

  it.each([
    "Piso tranquilo, no fumadores y sin mascotas",
    "Solo estudiantes o jóvenes profesionales",
    "En casa hablamos español y gallego",
    "Busco compañero español o extranjero, me da igual",
    "Bienvenidas personas de cualquier nacionalidad",
    "Muy cerca del barrio chino y de la Plaza de España",
    "Cocina con encimera negra y suelos de madera",
    "No hay problema con extranjeros ni con mascotas",
    "Solo chicas",
    "Ideal para Erasmus e internacionales",
  ])("no se queja de «%s»", (text) => {
    expect(findDiscriminatoryTerms(text)).toEqual([]);
  });
});

describe("al publicar", () => {
  const base = {
    title: "Habitación luminosa en el centro",
    description: "Habitación exterior en piso reformado, cerca de todo y con buena convivencia.",
    city: "Lugo",
    monthlyRent: 320,
    availableFrom: "2027-09-01",
  };

  it("bloquea título, descripción o zonas discriminatorios con un mensaje claro", () => {
    const e = publishErrors("room", listingDraftSchema.parse({ ...base, description: `${base.description} Solo españoles.` }));
    expect(e.description).toMatch(/No se pueden poner requisitos por origen.*«solo espanoles»/);
    expect(publishErrors("room", listingDraftSchema.parse({ ...base, title: "Habitación, no extranjeros" })).title).toBeDefined();
    const seeking = listingDraftSchema.parse({ ...base, zones: ["Centro", "sin inmigrantes"], maxBudget: 300, moveInDate: "2027-09-01" });
    expect(publishErrors("seeking", seeking).zones).toBeDefined();
    expect(publishErrors("room", listingDraftSchema.parse(base))).toEqual({});
  });

  it("«solo chicas» se permite en habitaciones y en busco; en piso entero solo avisa", () => {
    const d = listingDraftSchema.parse({ ...base, description: `${base.description} Solo chicas.` });
    expect(hasGenderRestriction(d.description)).toBe(true);
    expect(publishErrors("room", d)).toEqual({});
    expect(publishWarnings("room", d)).toEqual([]);
    expect(publishErrors("flat", d).description).toBeUndefined();
    expect(publishWarnings("flat", d)).toHaveLength(1);
  });
});
