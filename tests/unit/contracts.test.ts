import { describe, expect, it } from "vitest";

import { contractAvailability, GALICIA_PROVINCES, isGalicia } from "@/lib/contracts/availability";
import { contractKindErrors, contractTermsSchema, contractWarnings, suggestedKind } from "@/lib/contracts/schema";
import { contractToText, DRAFT_NOTICE, renderContract, textToBlocks } from "@/lib/contracts/templates";

const base = contractTermsSchema.parse({
  landlord_name: "Ana Casera López",
  tenant_name: "Bruno Inquilino Pérez",
  address: "Rúa da Raíña 12, 2º B, 27001 Lugo",
  monthly_rent: 320,
  deposit: 320,
  payment_day: 5,
  start_date: "2027-09-01",
  end_date: "2028-06-30",
});
const meta = { city: "Lugo", contractId: "c1", landlordId: "l1", tenantId: "t1" };

describe("plantillas de contrato", () => {
  it("son deterministas y llevan el aviso de borrador, las partes y las condiciones", () => {
    const text = contractToText(renderContract("room", base, meta));
    expect(contractToText(renderContract("room", base, meta))).toBe(text);
    expect(text).toContain(DRAFT_NOTICE);
    expect(text).toContain("Ana Casera López");
    expect(text).toContain("Bruno Inquilino Pérez");
    expect(text).toMatch(/320\s€ al mes/);
    expect(text).toContain("1 de septiembre de 2027");
    expect(text).toContain("Código Civil");
    // Convivo no pide el DNI/NIE: solo una línea en blanco por parte, para rellenar a mano.
    expect(text).toMatch(/DNI\/NIE de la parte arrendadora: _+\n/);
    expect(text).toMatch(/DNI\/NIE de la parte arrendataria: _+\n/);
    expect(text).toMatch(/Convivo no lo recoge ni lo guarda/);
    expect(base).not.toHaveProperty("dni");
  });

  it("cada tipo cita su régimen legal", () => {
    expect(contractToText(renderContract("flat_habitual", base, meta))).toMatch(/Título II[\s\S]*Arrendamientos Urbanos/);
    expect(contractToText(renderContract("flat_habitual", base, meta))).toContain("cinco años");
    const seasonal = { ...base, seasonal_reason: "estudios universitarios durante el curso 2027/28" };
    const s = contractToText(renderContract("flat_seasonal", seasonal, meta));
    expect(s).toContain("temporada");
    expect(s).toContain("estudios universitarios durante el curso 2027/28");
    expect(s).toContain("dos mensualidades");
  });

  it("los bloques se separan por línea en blanco y el primero es el título", () => {
    const blocks = textToBlocks(contractToText(renderContract("room", base, meta)));
    expect(blocks[0]).toMatch(/^CONTRATO DE ARRENDAMIENTO DE HABITACIÓN/);
  });
});

describe("disponibilidad del contrato de habitación (solo Galicia)", () => {
  it("las cuatro provincias gallegas lo permiten", () => {
    expect([...GALICIA_PROVINCES]).toEqual(["A Coruña", "Lugo", "Ourense", "Pontevedra"]);
    for (const p of GALICIA_PROVINCES) {
      expect(isGalicia(p)).toBe(true);
      expect(contractAvailability("room", p).available).toBe(true);
    }
  });

  it("fuera de Galicia (o sin provincia) no hay contrato de habitación, y el aviso dice que la estancia y las reseñas siguen igual", () => {
    for (const p of ["Madrid", "Asturias", "León", null, undefined]) {
      const a = contractAvailability("room", p);
      expect(a.available).toBe(false);
      if (!a.available) expect(a.message).toMatch(/todavía no está disponible fuera de Galicia[\s\S]*estancia[\s\S]*reseñas funcionan igual/);
    }
  });

  it("en Navarra y Cataluña el aviso menciona el cambio de regulación", () => {
    for (const p of ["Navarra", "Barcelona", "Girona", "Lleida", "Tarragona"]) {
      const a = contractAvailability("room", p);
      expect(a.available === false && a.message).toMatch(/regulación del alquiler de habitaciones.*ha cambiado/);
    }
    const madrid = contractAvailability("room", "Madrid");
    expect(madrid.available === false && madrid.message).not.toMatch(/ha cambiado/);
  });

  it("los pisos enteros no dependen de la provincia", () => {
    expect(contractAvailability("flat", "Madrid").available).toBe(true);
    expect(contractAvailability("flat", null).available).toBe(true);
  });
});

describe("condiciones", () => {
  it("la temporada exige fecha de fin y motivo", () => {
    const t = contractTermsSchema.parse({ ...base, end_date: "" });
    expect(contractKindErrors("flat_seasonal", t)).toMatchObject({ end_date: expect.any(String), seasonal_reason: expect.any(String) });
    expect(contractKindErrors("room", t)).toEqual({});
  });

  it("valida fechas y nombres, y avisa de fianzas por encima de la legal", () => {
    expect(contractTermsSchema.safeParse({ ...base, end_date: "2027-08-01" }).success).toBe(false);
    expect(contractTermsSchema.safeParse({ ...base, tenant_name: "ana casera lópez" }).success).toBe(false);
    expect(contractWarnings("flat_habitual", { ...base, deposit: 640 })).toHaveLength(1);
    expect(contractWarnings("room", { ...base, deposit: 640 })).toEqual([]);
  });

  it("sugiere el tipo según el anuncio", () => {
    expect(suggestedKind("room", "academic_year")).toBe("room");
    expect(suggestedKind("flat", "indefinite")).toBe("flat_habitual");
    expect(suggestedKind("flat", "academic_year")).toBe("flat_seasonal");
  });
});
