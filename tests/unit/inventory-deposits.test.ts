import { describe, expect, it } from "vitest";

import * as depositsModule from "@/lib/contracts/deposits";
import { depositGuideFor } from "@/lib/contracts/deposits";
import { compareWithEntry, groupByArea, inventoryItemSchema, isInventoryPhotoPath, stageFromSlug } from "@/lib/contracts/inventory";

const C = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";

describe("inventario", () => {
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
