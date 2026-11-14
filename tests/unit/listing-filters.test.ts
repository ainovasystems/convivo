import { describe, expect, it } from "vitest";

import {
  applyListingFilters,
  escapeLike,
  type FilterableQuery,
  parseFilters,
  filterChips,
  serializeFilters,
} from "@/lib/listings/filters";

/** Query builder falso que registra las llamadas. */
class Recorder implements FilterableQuery<Recorder> {
  calls: Array<[string, ...unknown[]]> = [];
  private rec(name: string, ...args: unknown[]) {
    this.calls.push([name, ...args]);
    return this;
  }
  eq(c: string, v: unknown) { return this.rec("eq", c, v); }
  ilike(c: string, p: string) { return this.rec("ilike", c, p); }
  in(c: string, v: readonly unknown[]) { return this.rec("in", c, v); }
  gte(c: string, v: unknown) { return this.rec("gte", c, v); }
  lte(c: string, v: unknown) { return this.rec("lte", c, v); }
  order(c: string, o: { ascending: boolean; nullsFirst?: boolean }) { return this.rec("order", c, o); }
  range(a: number, b: number) { return this.rec("range", a, b); }
}

const run = (params: Record<string, string>) => applyListingFilters(new Recorder(), parseFilters(params)).calls;

describe("parseFilters", () => {
  it("ignora valores inválidos sin romper", () => {
    expect(
      parseFilters({ tipo: "castillo", precio_min: "abc", desde: "ayer", pagina: "-3", provincia: "Narnia" }),
    ).toEqual({});
  });

  it("interpreta flags, números y fechas", () => {
    expect(
      parseFilters({ tipo: "room", precio_max: "400", desde: "2026-12-01", mascotas: "1", amueblado: "si", gastos: "" }),
    ).toEqual({ tipo: "room", precio_max: 400, desde: "2026-12-01", mascotas: true, amueblado: true });
  });

  it("acepta arrays de searchParams quedándose con el primero", () => {
    expect(parseFilters({ tipo: ["flat", "room"] } as never)).toEqual({ tipo: "flat" });
  });
});

describe("serializeFilters", () => {
  it("es canónica: omite vacíos, página 1 y orden por defecto", () => {
    expect(serializeFilters({ tipo: "room", pagina: 1, orden: "recientes", mascotas: true })).toBe("?tipo=room&mascotas=1");
    expect(serializeFilters({})).toBe("");
  });

  it("ida y vuelta conserva los filtros", () => {
    const f = parseFilters({ tipo: "flat", provincia: "A Coruña", precio_min: "500", orden: "precio_asc", pagina: "3" });
    const back = parseFilters(Object.fromEntries(new URLSearchParams(serializeFilters(f).slice(1))));
    expect(back).toEqual(f);
  });
});

describe("applyListingFilters", () => {
  it("sin filtros: solo activos, recientes primero, primera página", () => {
    expect(run({})).toEqual([
      ["eq", "status", "active"],
      ["order", "published_at", { ascending: false, nullsFirst: false }],
      ["order", "id", { ascending: true }],
      ["range", 0, 11],
    ]);
  });

  it("aplica todos los filtros de habitación/piso", () => {
    const calls = run({
      tipo: "room",
      provincia: "Lugo",
      ciudad: "Lugo",
      precio_min: "200",
      precio_max: "400",
      desde: "2026-12-01",
      amueblado: "1",
      gastos: "1",
      mascotas: "1",
      fumadores: "1",
      orden: "precio_asc",
      pagina: "2",
    });
    expect(calls).toEqual([
      ["eq", "status", "active"],
      ["eq", "kind", "room"],
      ["eq", "province", "Lugo"],
      ["ilike", "city", "%Lugo%"],
      ["gte", "monthly_rent", 200],
      ["lte", "monthly_rent", 400],
      ["lte", "available_from", "2026-12-01"],
      ["eq", "furnished", true],
      ["eq", "bills_included", true],
      ["eq", "rules->>pets", "true"],
      ["eq", "rules->>smoking", "true"],
      ["order", "monthly_rent", { ascending: true, nullsFirst: false }],
      ["order", "id", { ascending: true }],
      ["range", 12, 23],
    ]);
  });

  it("para 'busco' filtra y ordena por presupuesto, e ignora 'desde'", () => {
    const calls = run({ tipo: "seeking", precio_max: "700", desde: "2026-12-01", orden: "precio_desc" });
    expect(calls).toContainEqual(["lte", "max_budget", 700]);
    expect(calls).toContainEqual(["order", "max_budget", { ascending: false, nullsFirst: false }]);
    expect(calls.some(([, col]) => col === "available_from")).toBe(false);
  });

  it("la ciudad se busca como texto literal (sin comodines del usuario)", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(run({ ciudad: "%" })).toContainEqual(["ilike", "city", "%\\%%"]);
  });

  it("filtra por periodo de alquiler", () => {
    expect(run({ periodo: "curso" })).toContainEqual(["eq", "rental_term", "academic_year"]);
    expect(parseFilters({ periodo: "trimestre" }).periodo).toBeUndefined();
  });

  it("una ciudad conocida corrige la provincia incoherente", () => {
    expect(parseFilters({ ciudad: "Lugo", provincia: "Madrid" }).provincia).toBe("Lugo");
    expect(parseFilters({ ciudad: "Pueblo inventado", provincia: "Madrid" }).provincia).toBe("Madrid");
  });

  it("ya no existe el filtro de convivencia: se ignora y no llega a la consulta ni a la URL", () => {
    const f = parseFilters({ convivencia: "chicas" });
    expect("convivencia" in f).toBe(false);
    expect(run({ convivencia: "chicas" } as never).flat().join(" ")).not.toMatch(/cohabitation/);
    expect(serializeFilters(f)).not.toMatch(/convivencia/);
  });
});

describe("filterChips (resumen y chips quitables)", () => {
  it("sin filtros no hay chips", () => {
    expect(filterChips({})).toEqual([]);
    expect(filterChips(parseFilters({ pagina: "3", orden: "recientes" }))).toEqual([]);
  });

  it("cada filtro es un chip cuyo enlace quita solo ese filtro y la página", () => {
    const f = parseFilters({ tipo: "room", ciudad: "Lugo", precio_max: "300", amueblado: "1", pagina: "2" });
    const chips = filterChips(f);
    expect(chips.map((c) => c.label)).toEqual(["Habitación", "Lugo", "Hasta 300 €", "Amueblado"]);
    const byKey = Object.fromEntries(chips.map((c) => [c.key, c.removeHref]));
    expect(byKey.tipo).toBe("/anuncios?ciudad=Lugo&precio_max=300&amueblado=1");
    expect(byKey.precio).toBe("/anuncios?tipo=room&ciudad=Lugo&amueblado=1");
  });

  it("el precio es un único chip aunque haya mínimo y máximo, y el orden solo si no es el de por defecto", () => {
    const chips = filterChips(parseFilters({ precio_min: "200", precio_max: "400", orden: "precio_asc" }));
    expect(chips.map((c) => c.label)).toEqual(["200–400 €", "Precio: menor primero"]);
    expect(chips[0].removeHref).toBe("/anuncios?orden=precio_asc");
  });
});
