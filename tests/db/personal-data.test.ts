import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, sysInsert, type Db } from "./helpers";
import { BODY, CRITERIA, createWorld, writeReview } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const contains = async (text: string) =>
  (await db.query<{ k: string | null }>("select private.contains_personal_data($1) as k", [text])).rows[0].k;

describe("private.contains_personal_data", () => {
  it.each([
    ["Llámame al 600 12 34 56", "phone"],
    ["tel +34 600-123-456", "phone"],
    ["fijo 981.123.456", "phone"],
    ["escribe a Ana@Gmail.com", "email"],
    ["ana arroba gmail punto com", "email"],
    ["ana (at) hotmail", "email"],
    ["mi dni 12345678Z", "id"],
    ["NIE X-1234567-L", "id"],
    ["ES91 2100 0418 4502 0005 1332", "payment"],
  ])("detecta «%s»", async (text, kind) => {
    expect(await contains(text)).toBe(kind);
  });

  it.each([
    BODY,
    "Habitación de 12 m² por 450 € al mes, desde el 01/09/2026",
    "Contrato del 01-09-2026 al 30-06-2027 y código postal 27001",
    "Planta 3, 2 habitaciones, wifi de 600 Mb",
    "Calle Real 2 habitaciones",
  ])("deja pasar «%s»", async (text) => {
    expect(await contains(text)).toBeNull();
  });
});

describe("reseñas y respuestas con datos personales", () => {
  const long = BODY + " ";

  it("una reseña con teléfono o email se rechaza en la BD y no queda guardada", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    for (const extra of ["Su móvil es 600123456.", "Escribidle a ana@gmail.com."]) {
      await expect(
        writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord, body: long + extra }),
      ).rejects.toThrow(/no puede incluir teléfonos/);
    }
    const n = await db.query("select 1 from public.reviews where stay_id = $1", [w.stay]);
    expect(n.rows).toHaveLength(0);
    // Y la reseña limpia sigue entrando.
    await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
  });

  it("una respuesta pública con datos personales se rechaza", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await writeReview(db, { stay: w.stay, author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant });
    await expect(
      as(db, w.host, (tx) =>
        tx.query("insert into public.review_responses (review_id, author_id, body) values ($1, $2, $3)", [
          r.id,
          w.host,
          "Gracias, llámame al 600 123 456 y hablamos",
        ]),
      ),
    ).rejects.toThrow(/no puede incluir teléfonos/);
  });

  it("las inserciones de sistema (sin usuario) no se ven afectadas", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    await sysInsert(
      db,
      `insert into public.reviews (stay_id, author_id, subject_type, subject_user_id, rating, criteria, body)
       values ($1, $2, 'user', $3, 5, $4, $5) returning id`,
      [w.stay, w.guest, w.host, JSON.stringify(CRITERIA.tenant_to_landlord), long + "Contacto 600123456 (dato de prueba)."],
    );
  });
});
