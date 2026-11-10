import { describe, expect, it } from "vitest";

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
    expect(text).not.toMatch(/DNI|NIE/);
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
