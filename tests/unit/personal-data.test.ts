import { describe, expect, it } from "vitest";

import { listingDraftSchema, publishErrors } from "@/lib/listings/schema";
import {
  findPersonalData,
  listingPersonalDataSchema,
  personalDataError,
  PERSONAL_DATA_PREFIX,
  type PersonalDataKind,
} from "@/lib/moderation/personal-data";
import { profileSchema } from "@/lib/validation/profile";
import { responseSchema, reviewSchema } from "@/lib/reviews/schema";

const detects = (kind: PersonalDataKind, cases: string[]) =>
  it.each(cases)(`detecta ${kind}: «%s»`, (text) => {
    expect(findPersonalData(text)).toContain(kind);
  });

describe("teléfonos", () => {
  detects("phone", [
    "Llámame al 600123456",
    "Mi móvil es 600 12 34 56",
    "tel. 600.123.456",
    "600-123-456",
    "(600) 123 456",
    "+34 600 123 456",
    "+34600123456",
    "0034 600 123 456",
    "34 600 123 456",
    "fijo 981 12 34 56",
    "982-123-456",
    "Escríbeme: 6 0 0 1 2 3 4 5 6",
    "tfno: 912 345 678",
    "+351 912 345 678",
    "+44 7911 123456",
    "seis cero cero uno dos tres cuatro cinco seis",
    "llama al 7 1 1 2 2 3 3 4 4",
  ]);
});

describe("emails", () => {
  detects("email", [
    "escríbeme a ana@gmail.com",
    "ANA.PEREZ@Hotmail.es",
    "ana_perez+piso@correo.example.org",
    "ana arroba gmail punto com",
    "ana (at) gmail (dot) com",
    "ana [at] gmail.com",
    "ana arroba gmail",
    "ana(at)hotmail",
    "ana.perez arroba outlook punto es",
  ]);
});

describe("DNI, NIE, IBAN y tarjetas", () => {
  detects("id", ["Mi DNI es 12345678Z", "dni 12.345.678-Z", "12 345 678 z", "NIE X1234567L", "x-1234567-l", "Y 7654321 B"]);
  detects("payment", [
    "ES91 2100 0418 4502 0005 1332",
    "es9121000418450200051332",
    "ES91-2100-0418-4502-0005-1332",
    "GB82 WEST 1234 5698 7654 32",
    "DE89 3704 0044 0532 0130 00",
    "4111 1111 1111 1111",
    "4111-1111-1111-1111",
    "4111111111111111",
    "3782 822463 10005",
  ]);
});

describe("canales de contacto externos", () => {
  detects("social", [
    "https://wa.me/34600123456",
    "wa.me/qr/ABC",
    "chat.whatsapp.com/AbCdEf",
    "t.me/mi_usuario",
    "https://t.me/mi_usuario",
    "mi instagram: instagram.com/ana.perez",
    "www.facebook.com/ana",
    "hablamos por tiktok.com/@ana",
    "linktr.ee/ana",
    "búscame en @ana.perez",
    "snapchat.com/add/ana",
  ]);
});

describe("direcciones exactas", () => {
  detects("address", [
    "Vivo en la calle Mayor, 12",
    "Calle de la Paz 5",
    "C/ Real 3",
    "c/Real,3",
    "Avda. de Madrid nº 24",
    "Avenida de la Coruña, 45",
    "Paseo del Prado 8",
    "Plaza Mayor n.º 2",
    "Rúa do Home Santo, 14",
    "Praza do Campo 7",
    "Ronda de la Muralla 34",
    "Camino Viejo de Simancas 4",
    "Carretera de Castilla, 120",
    "en el 3º B",
    "Está en el 4ºB",
    "2º izquierda",
    "1º dcha",
    "piso 3, puerta B",
    "planta 2 puerta 4",
    "Puerta B",
    "portal 4",
    "Escalera B",
    "piso 3B",
  ]);
});

describe("lo normal NO salta", () => {
  it.each([
    "Habitación de 12 m² por 450 € al mes",
    "450 €/mes gastos incluidos",
    "Piso de 85 m2 con 3 habitaciones y 2 baños",
    "Disponible desde el 1 de septiembre de 2026",
    "Contrato del 01/09/2026 al 30/06/2027",
    "Del 01-09-2026 al 30-06-2027",
    "Desde 2024 hasta 2025",
    "Código postal 27001, Lugo",
    "Estoy en el 27001",
    "Planta 3 con ascensor, 2 habitaciones",
    "Está en la tercera planta, sin ascensor",
    "Piso con 3 dormitorios y 2 baños, 90 m²",
    "Cerca de la plaza Mayor, a 5 minutos andando",
    "Muy cerca de la calle Real",
    "A 2 min de la Plaza de Abastos",
    "Calle Real 2 habitaciones disponibles",
    "Hablamos español, inglés y gallego",
    "Zona Centro, Milagrosa, Garabolos",
    "Fianza de 900 € y 1 mes de renta",
    "Somos 4 compañeros, edad entre 22 y 28 años",
    "Gastos de 60-80 € al mes",
    "Precio: 1.200 € (negociable)",
    "Habitación nº 3 de un piso de 4",
    "Ocupación hasta el 2º semestre",
    "Hay 1 baño, 1 salón y 2 balcones",
    "Wifi de 600 Mb incluido",
    "Fibra de 600 Mbps y calefacción central",
    "Llevo 3 años aquí, 24 meses de contrato",
    "A las 9 de la mañana hay mucho ruido",
    "Convivencia tranquila, sin fiestas, ni humo",
    "El grupo de WhatsApp del piso funciona genial",
    "Nos mandamos mensajes por Telegram a veces",
    "1º a la derecha según se sube",
    "Un piso de 2 plantas con puerta blindada",
    "Hay una puerta a la calle y otra al patio",
    "Mi email es privado, escríbeme por el chat",
    "Metro a 400 m, bus 12 y 15",
    "Edificio de 1998 reformado en 2021",
    "Dos habitaciones: una de 14 m² y otra de 10 m²",
    "Tel. por el chat, por favor",
    "Reseña: todo muy bien, 10 de 10, repetiría 100 %",
  ])("deja pasar «%s»", (text) => {
    expect(findPersonalData(text)).toEqual([]);
  });

  it("no confunde una racha de fechas con una tarjeta", () => {
    expect(findPersonalData("Reservado 01-09-2026 30-06-2027")).toEqual([]);
    expect(findPersonalData("20260901 20270630")).toEqual([]);
  });

  it("un IBAN con control incorrecto de otro país no salta", () => {
    expect(findPersonalData("GB00 WEST 1234 5698 7654 32")).toEqual([]);
  });
});

describe("varios tipos a la vez", () => {
  it("devuelve todos los tipos, en orden fijo", () => {
    expect(findPersonalData("Llama al 600123456 o escribe a ana@gmail.com, calle Mayor 4")).toEqual([
      "phone",
      "email",
      "address",
    ]);
  });
});

describe("mensajes", () => {
  it("nunca repiten el dato detectado", () => {
    const samples = [
      "Llama al 600123456",
      "ana@gmail.com",
      "mi DNI 12345678Z",
      "ES91 2100 0418 4502 0005 1332",
      "wa.me/34600123456",
      "calle Mayor, 12",
    ];
    for (const text of samples) {
      for (const ctx of ["listing", "review", "profile"] as const) {
        const msg = personalDataError(text, ctx)!;
        expect(msg.startsWith(PERSONAL_DATA_PREFIX)).toBe(true);
        for (const token of text.split(/\s+/).filter((t) => /[\d@.]/.test(t) && t.length > 3)) expect(msg).not.toContain(token);
        for (const chunk of ["600123456", "ana@gmail", "12345678Z", "2100", "wa.me", "Mayor"]) expect(msg).not.toContain(chunk);
      }
    }
  });

  it("en anuncios explica que el contacto va por el chat de Hommie", () => {
    expect(personalDataError("ana@gmail.com", "listing")).toContain(
      "Para tu seguridad y la de quien te escribe, el contacto va por el chat de Hommie",
    );
  });

  it("en reseñas explica que son públicas e inmutables", () => {
    expect(personalDataError("ana@gmail.com", "review")).toContain("no se pueden editar");
  });

  it("nombra todos los tipos encontrados", () => {
    const msg = personalDataError("600123456 y ana@gmail.com", "listing")!;
    expect(msg).toContain("teléfono");
    expect(msg).toContain("email");
  });

  it("devuelve null si el texto está limpio", () => {
    expect(personalDataError("Habitación luminosa por 400 €", "listing")).toBeNull();
  });
});

describe("integración: anuncios", () => {
  const base = listingDraftSchema.parse({
    title: "Habitación exterior en el centro",
    description: "Habitación luminosa de 12 m² en piso compartido, con wifi y muy bien comunicada.",
    city: "Lugo",
    monthlyRent: 300,
    availableFrom: "2026-12-01",
  });

  it("el esquema marca título, descripción, zonas y barrio", () => {
    const r = listingPersonalDataSchema.safeParse({
      title: "Llama al 600123456",
      description: "Escríbeme a ana@gmail.com",
      zones: ["Centro", "calle Mayor 4"],
      neighborhood: "wa.me/34600123456",
    });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(["title", "description", "zones", "neighborhood"]);
  });

  it("publishErrors bloquea el teléfono del anunciante", () => {
    const e = publishErrors("room", { ...base, description: base.description + " Mi teléfono es 600 123 456." });
    expect(e.description).toContain(PERSONAL_DATA_PREFIX);
    expect(e.description).toContain("chat de Hommie");
  });

  it("publishErrors bloquea el email en el título y la dirección en las zonas", () => {
    const e = publishErrors("seeking", {
      ...base,
      title: "Busco piso, escribid a ana@gmail.com",
      zones: ["Calle Real, 5"],
      maxBudget: 300,
      moveInDate: "2026-12-01",
    });
    expect(e.title).toContain("email");
    expect(e.zones).toContain("dirección exacta");
  });

  it("un anuncio normal sigue siendo publicable", () => {
    expect(Object.keys(publishErrors("room", base))).toEqual([]);
  });
});

describe("integración: reseñas y respuestas", () => {
  const ok = {
    stayId: "11111111-1111-4111-8111-111111111111",
    subjectType: "user",
    subjectId: "22222222-2222-4222-8222-222222222222",
    relationship: "landlord_to_tenant",
    rating: 5,
    criteria: { payment_punctuality: 5, home_care: 5, coexistence: 5, communication: 5 },
    body: "Inquilina muy ordenada y puntual. Pagó siempre a tiempo y dejó el piso impecable al irse. Repetiría.",
  };

  it("acepta una reseña normal", () => {
    expect(reviewSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza datos personales en el texto de la reseña", () => {
    for (const extra of [" Su móvil es 600 123 456.", " Escribidle a ana@gmail.com.", " Vive en calle Mayor 4."]) {
      const r = reviewSchema.safeParse({ ...ok, body: ok.body + extra });
      expect(r.success).toBe(false);
      expect(r.error!.issues[0].message).toContain(PERSONAL_DATA_PREFIX);
      expect(r.error!.issues[0].path).toEqual(["body"]);
    }
  });

  it("rechaza datos personales en la respuesta pública", () => {
    const base = { reviewId: "33333333-3333-4333-8333-333333333333" };
    expect(responseSchema.safeParse({ ...base, body: "Gracias por tu opinión, fue un placer." }).success).toBe(true);
    const r = responseSchema.safeParse({ ...base, body: "Gracias, llámame al 600123456 si quieres." });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toContain("teléfono");
  });
});

describe("integración: biografía", () => {
  const ok = {
    displayName: "Ana",
    bio: "Estudiante de Enfermería, tranquila y ordenada.",
    city: "Lugo",
    occupation: "Estudiante",
    birthYear: "",
    languages: [],
    roles: [],
    habits: {},
  };

  it("acepta una biografía normal o vacía", () => {
    expect(profileSchema.safeParse(ok).success).toBe(true);
    expect(profileSchema.safeParse({ ...ok, bio: "" }).success).toBe(true);
  });

  it("rechaza datos personales en la biografía", () => {
    const r = profileSchema.safeParse({ ...ok, bio: "Escríbeme a ana@gmail.com o al 600123456" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual(["bio"]);
    expect(r.error!.issues[0].message).toContain("Tu perfil es público");
  });
});

describe("aviso sobre datos sensibles de terceros", () => {
  it("lleva el texto acordado, con las categorías y la consecuencia", async () => {
    const { SENSITIVE_DATA_NOTICE } = await import("@/lib/moderation/personal-data");
    expect(SENSITIVE_DATA_NOTICE).toBe(
      "No escribas sobre la salud, la religión, el origen racial o étnico, la orientación o la vida sexual, la ideología política o sindical ni los antecedentes penales de nadie. Si lo haces, la reseña puede ocultarse.",
    );
  });

  it("el motivo «datos personales» de la denuncia incluye los sensibles", async () => {
    const { REPORT_REASONS } = await import("@/lib/reviews/schema");
    expect(REPORT_REASONS.personal_data).toMatch(/sensibles|salud/);
    expect(REPORT_REASONS.personal_data).toContain("terceros");
  });
});
