import { describe, expect, it } from "vitest";

import { findCity, KNOWN_CITY_NAMES } from "@/lib/listings/cities";
import { academicYearFor, periodText, PROVINCES } from "@/lib/listings/options";
import { listingDraftSchema, publishErrors, toListingRow } from "@/lib/listings/schema";

const base = {
  title: "Habitación luminosa en el centro",
  description: "Habitación exterior en piso reformado, cerca de todo y con buena convivencia.",
  city: "Lugo",
  monthlyRent: 320,
  availableFrom: "2027-09-01",
};

describe("ciudades conocidas", () => {
  it("encuentra la provincia con o sin tildes y con nombres alternativos", () => {
    expect(findCity("lugo")).toEqual({ name: "Lugo", province: "Lugo" });
    expect(findCity("  LA CORUÑA ")).toEqual({ name: "A Coruña", province: "A Coruña" });
    expect(findCity("Lérida")?.province).toBe("Lleida");
    expect(findCity("san sebastian")?.name).toBe("Donostia-San Sebastián");
    expect(findCity("Santiago")?.province).toBe("A Coruña");
    expect(findCity("Pueblo inventado")).toBeNull();
    expect(findCity("")).toBeNull();
  });

  it("todas las provincias de la lista existen", () => {
    for (const name of KNOWN_CITY_NAMES) {
      expect(PROVINCES).toContain(findCity(name)?.province);
    }
  });

  it("al guardar, una ciudad conocida impone su provincia y su nombre oficial", () => {
    const d = listingDraftSchema.parse({ ...base, city: "orense", province: "Madrid" });
    expect(toListingRow("room", d)).toMatchObject({ city: "Ourense", province: "Ourense" });
    // Y no hace falta elegir provincia para publicar.
    expect(publishErrors("room", listingDraftSchema.parse({ ...base, province: null }))).toEqual({});
  });

  it("si la ciudad no está en la lista, hay que elegir provincia", () => {
    const d = listingDraftSchema.parse({ ...base, city: "Pueblo inventado" });
    expect(publishErrors("room", d).province).toBeDefined();
    expect(toListingRow("room", listingDraftSchema.parse({ ...d, province: "Lugo" })).province).toBe("Lugo");
  });
});

describe("periodo de alquiler", () => {
  it("auditoría I15: «curso» propone el fin del curso en marcha según la fecha de entrada", () => {
    const today = new Date("2026-11-17T12:00:00");
    // Entrando en diciembre de 2026, el curso termina en junio de 2027 (no de 2028).
    expect(academicYearFor("2026-12-01", today)).toEqual({ from: "2026-12-01", until: "2027-06-30" });
    expect(academicYearFor("2026-09-01", today)).toEqual({ from: "2026-09-01", until: "2027-06-30" });
    expect(academicYearFor("2027-02-15", today)).toEqual({ from: "2027-02-15", until: "2027-06-30" });
    expect(academicYearFor("2027-06-10", today)).toEqual({ from: "2027-06-10", until: "2027-06-30" });
    // En julio y agosto ya se habla del curso que empieza en septiembre.
    expect(academicYearFor("2027-07-15", today)).toEqual({ from: "2027-07-15", until: "2028-06-30" });
    expect(academicYearFor("2027-09-01", today)).toEqual({ from: "2027-09-01", until: "2028-06-30" });
    // Sin fecha de entrada: hoy, o el 1 de septiembre si es verano.
    expect(academicYearFor("", today)).toEqual({ from: "2026-11-17", until: "2027-06-30" });
    expect(academicYearFor(null, new Date("2027-08-03T12:00:00"))).toEqual({ from: "2027-09-01", until: "2028-06-30" });
  });

  it("curso o fechas concretas exigen fecha de fin posterior a la entrada", () => {
    const course = (until: string | null) =>
      publishErrors("room", listingDraftSchema.parse({ ...base, rentalTerm: "academic_year", availableUntil: until }));
    expect(course(null).availableUntil).toBe("Indica hasta cuándo");
    expect(course("2027-08-01").availableUntil).toBe("Debe ser posterior a la fecha de entrada");
    expect(course("2028-06-30")).toEqual({});
  });

  it("sin fecha de fin descarta la fecha 'hasta'", () => {
    const d = listingDraftSchema.parse({ ...base, rentalTerm: "indefinite", availableUntil: "2028-06-30" });
    expect(toListingRow("room", d)).toMatchObject({ rental_term: "indefinite", available_until: null });
  });

  it("texto corto para las tarjetas", () => {
    expect(periodText({ rental_term: "academic_year", available_until: "2028-06-30" })).toBe("Curso 2027/28");
    expect(periodText({ rental_term: "indefinite", available_until: null })).toBeNull();
  });
});
