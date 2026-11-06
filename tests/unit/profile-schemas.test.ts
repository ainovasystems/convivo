import { describe, expect, it } from "vitest";

import { habitChips } from "@/lib/profile/options";
import { overallRating } from "@/lib/reviews/labels";
import { sniffImageType } from "@/lib/validation/image";
import { avatarFileSchema, habitsSchema, profileFormDataToObject, profileSchema } from "@/lib/validation/profile";

function formData(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("profileSchema + profileFormDataToObject", () => {
  it("convierte el formulario y deja vacíos como null / sin indicar", () => {
    const fd = formData([
      ["displayName", " Brais "],
      ["bio", ""],
      ["city", "Lugo"],
      ["occupation", ""],
      ["birthYear", "2003"],
      ["languages", "es"],
      ["languages", "gl"],
      ["roles", "tenant"],
      ["smoker", "no"],
      ["pets", ""],
      ["schedule", "night"],
      ["cleanliness", "4"],
      ["noise", ""],
      ["guests", ""],
    ]);
    const r = profileSchema.parse(profileFormDataToObject(fd));
    expect(r).toEqual({
      displayName: "Brais",
      bio: null,
      city: "Lugo",
      occupation: null,
      birthYear: 2003,
      languages: ["es", "gl"],
      roles: ["tenant"],
      habits: { smoker: false, schedule: "night", cleanliness: 4 },
    });
  });

  it("rechaza valores fuera de las listas cerradas", () => {
    const base = { displayName: "Ana", bio: "", city: "", occupation: "", birthYear: null, roles: [], habits: {} };
    expect(profileSchema.safeParse({ ...base, languages: ["klingon"] }).success).toBe(false);
    // Menor de edad o año imposible.
    expect(profileSchema.safeParse({ ...base, languages: [], birthYear: new Date().getFullYear() - 17 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, languages: [], birthYear: 1800 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, languages: [], birthYear: new Date().getFullYear() - 18 }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, languages: [], roles: ["admin"] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, languages: [], bio: "x".repeat(1001) }).success).toBe(false);
  });

  it("los hábitos no admiten claves libres (anti-discriminación)", () => {
    expect(habitsSchema.safeParse({ religion: "x" }).success).toBe(false);
    expect(habitsSchema.safeParse({ cleanliness: 6 }).success).toBe(false);
    expect(habitsSchema.safeParse({ smoker: true, noise: 2 }).success).toBe(true);
  });
});

describe("avatarFileSchema", () => {
  const file = (size: number, type: string) => new File([new Uint8Array(size)], "a", { type });

  it("acepta imágenes de hasta 2 MB", () => {
    expect(avatarFileSchema.safeParse(file(1000, "image/webp")).success).toBe(true);
  });
  it("rechaza más de 2 MB, otros tipos y archivos vacíos", () => {
    expect(avatarFileSchema.safeParse(file(2 * 1024 * 1024 + 1, "image/png")).error?.issues[0].message).toContain("2 MB");
    expect(avatarFileSchema.safeParse(file(10, "image/gif")).error?.issues[0].message).toContain("Formato");
    expect(avatarFileSchema.safeParse(file(0, "image/png")).success).toBe(false);
    expect(avatarFileSchema.safeParse("no-es-un-archivo").success).toBe(false);
  });
});

describe("sniffImageType", () => {
  it("detecta el tipo real por los bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("habitChips y overallRating", () => {
  it("genera chips legibles", () => {
    expect(habitChips({ smoker: false, pets: true, schedule: "shifts" })).toEqual([
      "No fumador/a",
      "Con mascotas",
      "Trabajo a turnos",
    ]);
  });
  it("pondera la media global por número de reseñas", () => {
    expect(overallRating([])).toBeNull();
    expect(
      overallRating([
        { relationship: "tenant_to_landlord", review_count: 3, avg_rating: 5 },
        { relationship: "flatmate_to_flatmate", review_count: 1, avg_rating: 1 },
      ]),
    ).toEqual({ avg: 4, count: 4 });
  });
});
