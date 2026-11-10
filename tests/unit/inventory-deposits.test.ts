import { describe, expect, it } from "vitest";

import { DEPOSIT_RULES, depositRuleFor, PROVINCE_CCAA } from "@/lib/contracts/deposits";
import { compareWithEntry, groupByArea, inventoryItemSchema, isInventoryPhotoPath, stageFromSlug } from "@/lib/contracts/inventory";
import { PROVINCES } from "@/lib/listings/options";

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
  it("todas las provincias tienen comunidad y todas las comunidades, regla", () => {
    for (const p of PROVINCES) expect(DEPOSIT_RULES[PROVINCE_CCAA[p]]).toBeDefined();
  });

  it("si hay que depositarla, dice dónde y en qué plazo", () => {
    for (const rule of Object.values(DEPOSIT_RULES)) {
      if (rule.required) {
        expect(rule.organism).toBeTruthy();
        expect(rule.deadline).toBeTruthy();
      }
    }
    expect(depositRuleFor("Lugo")?.rule.organism).toMatch(/IGVS/);
    expect(depositRuleFor("Sevilla")?.rule.required).toBe(false);
    expect(depositRuleFor(null)).toBeNull();
    expect(depositRuleFor("Atlántida")).toBeNull();
  });
});
