import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reviewFormDataToObject, reviewSchema } from "@/lib/reviews/schema";
import { reviewTargets } from "@/lib/reviews/targets";
import { hashSignal } from "@/lib/signals";

const stay = { host_id: "H", guest_id: "G", listing_id: "L", confirmedParticipants: ["M1", "M2"] };

describe("reviewTargets (espejo del trigger de la BD)", () => {
  it("el inquilino reseña inmueble, propietario y compañeros", () => {
    expect(reviewTargets(stay, "G").map((t) => `${t.relationship}:${t.subjectId}`)).toEqual([
      "tenant_to_listing:L",
      "tenant_to_landlord:H",
      "flatmate_to_flatmate:M1",
      "flatmate_to_flatmate:M2",
    ]);
  });
  it("el propietario solo reseña al inquilino", () => {
    expect(reviewTargets(stay, "H").map((t) => t.relationship)).toEqual(["landlord_to_tenant"]);
  });
  it("un compañero reseña al inquilino y a los demás compañeros, no al propietario", () => {
    expect(reviewTargets(stay, "M1").map((t) => t.subjectId)).toEqual(["G", "M2"]);
  });
  it("alguien ajeno no reseña nada", () => {
    expect(reviewTargets(stay, "X")).toEqual([]);
  });
});

describe("reviewSchema", () => {
  const id = "3f2b2c1a-1111-4222-8333-444455556666";
  const fd = (entries: Array<[string, string]>) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };
  const base: Array<[string, string]> = [
    ["stayId", id],
    ["subjectType", "user"],
    ["subjectId", id],
    ["relationship", "tenant_to_landlord"],
    ["rating", "4"],
    ["body", "Muy buen trato durante toda la estancia, respondió siempre rápido a todo."],
  ];
  const criteria: Array<[string, string]> = [
    ["criteria.communication", "5"],
    ["criteria.treatment", "4"],
    ["criteria.compliance", "4"],
    ["criteria.deposit", "5"],
  ];

  it("acepta una reseña completa", () => {
    const r = reviewSchema.parse(reviewFormDataToObject(fd([...base, ...criteria])));
    expect(r.criteria).toEqual({ communication: 5, treatment: 4, compliance: 4, deposit: 5 });
  });
  it("exige todos los criterios de la relación y ninguno más", () => {
    const missing = reviewSchema.safeParse(reviewFormDataToObject(fd([...base, ...criteria.slice(1)])));
    expect(missing.error?.issues.map((i) => i.path.join("."))).toContain("criteria.communication");
    const extra = reviewSchema.safeParse(reviewFormDataToObject(fd([...base, ...criteria, ["criteria.origen", "3"]])));
    expect(extra.success).toBe(false);
  });
  it("texto de 50 a 1500 caracteres y nota de 1 a 5", () => {
    const short = reviewFormDataToObject(fd([...base.filter(([k]) => k !== "body"), ["body", "Bien."], ...criteria]));
    expect(reviewSchema.safeParse(short).success).toBe(false);
    const noRating = reviewFormDataToObject(fd([...base.filter(([k]) => k !== "rating"), ...criteria]));
    expect(reviewSchema.safeParse(noRating).success).toBe(false);
  });
  it("tipo de sujeto y relación deben cuadrar", () => {
    const bad = reviewFormDataToObject(fd([...base.map(([k, v]): [string, string] => [k, k === "subjectType" ? "listing" : v]), ...criteria]));
    expect(reviewSchema.safeParse(bad).success).toBe(false);
  });
});

describe("hashSignal", () => {
  it("no guarda la IP en claro y depende del secreto", () => {
    const a = hashSignal("1.2.3.4", "s1");
    expect(a).toHaveLength(64);
    expect(a).not.toContain("1.2.3.4");
    expect(hashSignal("1.2.3.4", "s2")).not.toBe(a);
  });
});
