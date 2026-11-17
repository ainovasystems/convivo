import { describe, expect, it } from "vitest";

import * as depositsModule from "@/lib/contracts/deposits";
import { depositGuideFor } from "@/lib/contracts/deposits";
import {
  compareWithEntry,
  groupByArea,
  inventoryChanges,
  inventoryItemEditSchema,
  inventoryItemSchema,
  isInventoryPhotoPath,
  stageFromSlug,
} from "@/lib/contracts/inventory";
import { signatureLabel } from "@/lib/contracts/signature";
import { formatMoney } from "@/lib/money";

const C = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";

describe("importes (auditoría B2)", () => {
  const plain = (n: number) => formatMoney(n).replace(/\u00a0/g, " ");
  it("nunca redondea a euros: los céntimos se ven siempre, con coma decimal", () => {
    expect(plain(12.5)).toBe("12,50 €");
    expect(plain(962.5)).toBe("962,50 €");
    expect(plain(100.5)).toBe("100,50 €");
    expect(plain(0.05)).toBe("0,05 €");
    expect(plain(19.99)).toBe("19,99 €");
  });
  it("los euros justos van sin decimales, y los millares con punto a partir de 10.000 (igual que private.format_eur)", () => {
    expect(plain(900)).toBe("900 €");
    expect(plain(1800)).toBe("1800 €");
    expect(plain(12345.6)).toBe("12.345,60 €");
    expect(plain(1000000)).toBe("1.000.000 €");
    expect(plain(0)).toBe("0 €");
  });
  it("no arrastra errores de coma flotante", () => {
    expect(plain(0.1 + 0.2)).toBe("0,30 €");
    expect(plain(162.99999999999997)).toBe("163 €");
  });
});

describe("registro de firmas (auditoría, menor 20)", () => {
  it("enseña el nombre como figura en el contrato y, si difiere, lo tecleado", () => {
    expect(signatureLabel("Iván Inquilino Prueba", "x", "iván INQUILINO prueba")).toBe("Iván Inquilino Prueba (tecleado al firmar: «iván INQUILINO prueba»)");
    expect(signatureLabel("Carmen Casera Prueba", "x", "Carmen Casera Prueba")).toBe("Carmen Casera Prueba");
    // Contratos firmados antes de guardar ese nombre: se usa el de las condiciones.
    expect(signatureLabel(null, "Iván Inquilino Prueba", "iván INQUILINO prueba")).toContain("Iván Inquilino Prueba (tecleado");
    expect(signatureLabel(null, undefined, "Ana")).toBe("Ana");
  });
});

describe("inventario", () => {
  it("auditoría B1: dice qué ha cambiado desde lo que se tenía delante", () => {
    const item = (id: string, updated_at = "2027-01-01T10:00:00Z", name = id) => ({ id, updated_at, area: "Cocina", name });
    const seen = [item("a"), item("b"), item("c", undefined, "Nevera")];
    const current = [item("a"), item("b", "2027-01-01T10:05:00Z"), item("d")];
    expect(inventoryChanges(seen, current)).toEqual({ added: ["d"], edited: ["b"], removed: ["Cocina · Nevera"] });
    expect(inventoryChanges(seen, seen)).toEqual({ added: [], edited: [], removed: [] });
  });

  it("auditoría I5: al corregir un elemento no se envían la zona ni el nombre", () => {
    const parsed = inventoryItemEditSchema.safeParse({ area: "Otra", name: "Otro", condition: "damaged", notes: " Roto ", photos: [] });
    expect(parsed.success && parsed.data).toEqual({ condition: "damaged", notes: "Roto", photos: [] });
    expect(inventoryItemEditSchema.safeParse({ condition: "fatal" }).success).toBe(false);
  });

  it("valida el elemento y limita las fotos", () => {
    expect(inventoryItemSchema.safeParse({ area: "Cocina", name: "Nevera", condition: "good" }).success).toBe(true);
    expect(inventoryItemSchema.safeParse({ area: "", name: "Nevera", condition: "good" }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ area: "Cocina", name: "Nevera", condition: "perfecto" }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ area: "Cocina", name: "Nevera", condition: "good", photos: Array(7).fill("x") }).success).toBe(false);
  });

  it("solo acepta fotos de la carpeta de ese inventario", () => {
    expect(isInventoryPhotoPath(`${C}/${I}/33333333-3333-4333-8333-333333333333.webp`, C, I)).toBe(true);
    expect(isInventoryPhotoPath(`${I}/${C}/33333333-3333-4333-8333-333333333333.webp`, C, I)).toBe(false);
    expect(isInventoryPhotoPath(`${C}/${I}/../otra.webp`, C, I)).toBe(false);
    expect(isInventoryPhotoPath("https://example.com/a.webp", C, I)).toBe(false);
  });

  it("traduce la URL y agrupa por zona", () => {
    expect(stageFromSlug("entrada")).toBe("entry");
    expect(stageFromSlug("salida")).toBe("exit");
    expect(stageFromSlug("exit")).toBeNull();
    const g = groupByArea([{ area: "Cocina" }, { area: "Baño" }, { area: "Cocina" }]);
    expect(g.map((x) => [x.area, x.items.length])).toEqual([["Cocina", 2], ["Baño", 1]]);
  });

  it("marca solo los daños nuevos, no el desgaste", () => {
    const r = compareWithEntry(
      [
        { area: "Cocina", name: "Nevera", condition: "damaged" },
        { area: "Cocina", name: "Mesa", condition: "worn" },
        { area: "Baño", name: "Espejo", condition: "damaged" },
      ],
      [
        { area: "cocina", name: "nevera", condition: "good" },
        { area: "Cocina", name: "Mesa", condition: "new" },
        { area: "Baño", name: "Espejo", condition: "damaged" },
      ],
    );
    expect(r.map((x) => x.newDamage)).toEqual([true, false, false]);
  });
});

describe("guía de la fianza", () => {
  it("solo tiene dos versiones: Galicia y resto de España", () => {
    for (const p of ["A Coruña", "Lugo", "Ourense", "Pontevedra"]) expect(depositGuideFor(p).version).toBe("galicia");
    for (const p of ["Madrid", "Sevilla", "Barcelona", "Navarra", null, undefined, "Atlántida"]) {
      expect(depositGuideFor(p).version).toBe("other");
    }
    // Ya no hay datos por comunidad autónoma.
    expect(Object.keys(depositsModule).sort()).toEqual(["DEPOSIT_NOTICE", "DEPOSIT_RETURN_TEXT", "depositGuideFor"]);
  });

  it("Galicia: IGVS, gratuito y sin intereses, copia del justificante en un mes, y dice lo que no está confirmado", () => {
    const g = depositGuideFor("Lugo");
    const text = [...g.paragraphs, ...g.unconfirmed].join(" ");
    expect(text).toMatch(/Instituto Galego da Vivenda e Solo \(IGVS\)/);
    expect(text).toMatch(/gratuito y no genera intereses/);
    expect(text).toMatch(/copia del justificante.*un mes/);
    expect(g.unconfirmed.join(" ")).toMatch(/plazo de un mes.*fuentes secundarias.*no lo hemos confirmado/);
    expect(g.unconfirmed.join(" ")).toMatch(/habitaciones/);
    expect(g.law).toMatch(/Decreto 42\/2011/);
  });

  it("resto de España: texto genérico, sin organismos ni plazos por comunidad", () => {
    const g = depositGuideFor("Madrid");
    expect(g.paragraphs.join(" ")).toMatch(/organismo de vivienda de tu comunidad/);
    expect(g.paragraphs.join(" ")).toMatch(/no es obligatorio/);
    expect(g.paragraphs.join(" ")).not.toMatch(/Agencia|IGVS|plazo de/i);
    expect(g.url).toBeUndefined();
  });

  it("siempre lleva el aviso de «orientativo» y de consultar el organismo", () => {
    for (const p of ["Lugo", "Madrid", null]) {
      expect(depositGuideFor(p).notice).toMatch(/orientativa.*consulta el organismo de vivienda/);
    }
  });
});
