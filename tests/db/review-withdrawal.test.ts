import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWorld, CRITERIA, writeReview } from "./fixtures";
import { as, createTestDb, createUser, type Db } from "./helpers";

/**
 * Solicitud de retirada de una reseña propia (auditoría I11): es una denuncia
 * con motivo 'author_withdrawal'. La reseña no cambia hasta que decide un admin.
 */
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const MOTIVO = "Me equivoqué de persona al escribirla";

async function makeAdmin(name: string) {
  const id = await createUser(db, name);
  await db.query("insert into public.admin_users (user_id) values ($1)", [id]);
  return id;
}

const request = (user: string, review: string, details: string | null = MOTIVO) =>
  as(db, user, async (tx) =>
    (
      await tx.query<{ id: string }>(
        "insert into public.reports (reporter_id, target_review_id, reason, details) values ($1, $2, 'author_withdrawal', $3) returning id",
        [user, review, details],
      )
    ).rows[0].id,
  );

const notifications = async (user: string) =>
  (await db.query<{ kind: string; title: string; body: string; url: string | null }>(
    "select kind, title, body, url from public.notifications where user_id = $1 order by created_at, id",
    [user],
  )).rows;

async function world() {
  const w = await createWorld(db);
  const review = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
  return { w, review };
}

describe("solicitud de retirada de una reseña propia", () => {
  it("solo la pide quien escribió la reseña, con motivo, y una sola abierta a la vez", async () => {
    const { w, review } = await world();
    // El reseñado y un tercero no pueden usar este motivo sobre una reseña ajena.
    await expect(request(w.host, review.id)).rejects.toThrow(/que hayas escrito tú/);
    await expect(request(w.stranger, review.id)).rejects.toThrow(/que hayas escrito tú/);
    // Sin motivo, o demasiado corto, no se registra.
    await expect(request(w.guest, review.id, null)).rejects.toThrow(/motivo/);
    await expect(request(w.guest, review.id, "  corto  ")).rejects.toThrow(/motivo/);
    // Tampoco sobre algo que no sea una reseña.
    await expect(
      as(db, w.guest, (tx) =>
        tx.query("insert into public.reports (reporter_id, target_user_id, reason, details) values ($1, $2, 'author_withdrawal', $3)", [
          w.guest, w.host, MOTIVO,
        ]),
      ),
    ).rejects.toThrow(/que hayas escrito tú/);

    await request(w.guest, review.id);
    await expect(request(w.guest, review.id)).rejects.toThrow(/reports_one_open_per_review/);
  });

  it("pedirla no cambia la reseña ni la oculta", async () => {
    const { w, review } = await world();
    const before = (await db.query("select body, rating, criteria, deleted_at, published_at from public.reviews where id = $1", [review.id])).rows[0];
    await request(w.guest, review.id);
    const after = (await db.query("select body, rating, criteria, deleted_at, published_at from public.reviews where id = $1", [review.id])).rows[0];
    expect(after).toEqual(before);
    expect((await db.query<{ hidden: boolean }>("select private.review_is_hidden($1) as hidden", [review.id])).rows[0].hidden).toBe(false);
    // El autor sigue sin poder borrarla por su cuenta.
    await expect(
      as(db, w.guest, (tx) => tx.query("select public.delete_review($1, $2)", [review.id, MOTIVO])),
    ).rejects.toThrow(/solicitar su retirada/);
  });

  it("solo la ven el autor y los admins", async () => {
    const { w, review } = await world();
    const admin = await makeAdmin("Admin Ve Solicitudes");
    const id = await request(w.guest, review.id);
    const seen = (u: string) => as(db, u, async (tx) => (await tx.query("select 1 from public.reports where id = $1", [id])).rows.length);
    expect(await seen(w.guest)).toBe(1);
    expect(await seen(admin)).toBe(1);
    expect(await seen(w.host)).toBe(0);
    expect(await seen(w.stranger)).toBe(0);
  });

  it("si el admin la rechaza, la reseña sigue igual y el autor recibe el motivo", async () => {
    const { w, review } = await world();
    const admin = await makeAdmin("Admin Rechaza");
    const id = await request(w.guest, review.id);
    // Nadie más que un admin decide.
    await as(db, w.guest, (tx) =>
      tx.query("update public.reports set status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = 'Yo mismo' where id = $1", [id, w.guest]),
    );
    expect((await db.query<{ status: string }>("select status from public.reports where id = $1", [id])).rows[0].status).toBe("open");

    await as(db, admin, (tx) =>
      tx.query("update public.reports set status = 'dismissed', resolved_by = $2, resolved_at = now(), resolution_note = 'La reseña es veraz y útil' where id = $1", [id, admin]),
    );
    expect((await db.query<{ deleted_at: Date | null; body: string | null }>("select deleted_at, body from public.reviews where id = $1", [review.id])).rows[0])
      .toMatchObject({ deleted_at: null, body: expect.any(String) });
    const n = await notifications(w.guest);
    expect(n).toEqual([
      expect.objectContaining({ kind: "report_decision", title: "No hemos retirado tu reseña", url: `/mis-resenas?retirada=${review.id}` }),
    ]);
    expect(n[0].body).toContain("La reseña es veraz y útil");
    // Rechazada una, puede volver a pedirlo.
    await request(w.guest, review.id, "Ahora lo explico mejor: confundí el piso");
  });

  it("si el admin la acepta, la reseña se retira con constancia y el autor recibe UN aviso, el de su solicitud", async () => {
    const { w, review } = await world();
    const admin = await makeAdmin("Admin Acepta");
    const id = await request(w.guest, review.id);
    await as(db, admin, (tx) =>
      tx.query("select public.delete_review($1, 'Retirada a petición de quien la escribió: se equivocó de persona')", [review.id]),
    );
    await as(db, admin, (tx) =>
      tx.query("update public.reports set status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = 'Se equivocó de persona' where id = $1", [id, admin]),
    );
    const r = (await db.query<{ body: string | null; rating: number | null; deleted_at: Date | null; deleted_by: string }>(
      "select body, rating, deleted_at, deleted_by from public.reviews where id = $1", [review.id])).rows[0];
    expect(r).toMatchObject({ body: null, rating: null, deleted_by: admin });
    expect(r.deleted_at).not.toBeNull();

    const n = await notifications(w.guest);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: "report_decision", title: "Hemos retirado tu reseña", url: `/mis-resenas?retirada=${review.id}` });
    expect(n[0].body).toContain("Se equivocó de persona");

    const log = await db.query<{ action: string }>("select action from public.moderation_log where target_id = any($1) order by id", [[id, review.id]]);
    expect(log.rows.map((x) => x.action)).toEqual(["review_deleted", "report_resolved"]);
    // Ya retirada, no se puede volver a pedir.
    await expect(request(w.guest, review.id)).rejects.toThrow(/que hayas escrito tú/);
  });

  it("la decisión sobre una reseña no da por atendido el aviso de otra", async () => {
    const w = await createWorld(db);
    const admin = await makeAdmin("Admin Dos Reseñas");
    const a = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    const b = await writeReview(db, { stay: w.stay, author: w.guest, subjectListing: w.listing, criteria: CRITERIA.tenant_to_listing });
    for (const r of [a, b]) {
      const id = await request(w.guest, r.id);
      await as(db, admin, (tx) =>
        tx.query("update public.reports set status = 'dismissed', resolved_by = $2, resolved_at = now(), resolution_note = 'Es veraz' where id = $1", [id, admin]),
      );
    }
    const open = await db.query("select 1 from public.notifications where user_id = $1 and kind = 'report_decision' and resolved_at is null", [w.guest]);
    expect(open.rows).toHaveLength(2);
  });

  it("mantiene el límite de 10 denuncias al día", async () => {
    const w = await createWorld(db);
    const review = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    for (let i = 0; i < 10; i++) {
      await as(db, w.guest, (tx) =>
        tx.query("insert into public.reports (reporter_id, target_user_id, reason) values ($1, $2, 'spam')", [w.guest, w.stranger]),
      );
    }
    await expect(request(w.guest, review.id)).rejects.toThrow(/demasiadas denuncias/);
  });
});
