import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActiveListing, createWorld, CRITERIA, writeReview } from "./fixtures";
import { as, createTestDb, createUser, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const EXPLANATION = "La reseña me acusa de haberme quedado la fianza de forma ilegal, y es falso: la devolví entera.";

function submit(viewer: string | null, p: { type: string; id: string | null; email?: string; ip?: string; goodFaith?: boolean }) {
  return as(db, viewer, async (tx) => {
    const { rows } = await tx.query<{ ref: string }>(
      `select public.submit_legal_notice($1, $2, $3, 'defamation', $4, 'Marta Casera', $5, $6, $7, $8) as ref`,
      [p.type, p.id, `https://convivo.test/x/${p.id ?? "y"}`, EXPLANATION, p.email ?? "marta@casera.es", p.goodFaith ?? true, h(p.ip ?? "1.1.1.1"), h(p.email ?? "marta@casera.es")],
    );
    return rows[0].ref;
  });
}

async function makeAdmin(name: string) {
  const id = await createUser(db, name);
  await db.query("insert into public.admin_users (user_id) values ($1)", [id]);
  return id;
}

describe("canal público de denuncias (DSA art. 16)", () => {
  it("cualquiera, también sin cuenta, notifica y recibe una referencia; vence en 72 h", async () => {
    const w = await createWorld(db);
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    const ref = await submit(null, { type: "review", id: r.id });
    expect(ref).toMatch(/^[0-9A-F]{8}$/);
    const { rows } = await db.query<{ status: string; hours: number }>(
      "select status, extract(epoch from due_at - created_at) / 3600 as hours from public.legal_notices where reference = $1",
      [ref],
    );
    expect(rows[0]).toMatchObject({ status: "received" });
    expect(Number(rows[0].hours)).toBe(72);
  });

  it("exige buena fe, explicación suficiente y que el contenido exista", async () => {
    const owner = await createUser(db, "Anunciante Notificado");
    const listing = (await createActiveListing(db, owner)).id;
    await expect(submit(null, { type: "listing", id: listing, goodFaith: false })).rejects.toThrow(/legal_notices_good_faith/);
    await expect(submit(null, { type: "listing", id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/No encontramos/);
    await expect(
      as(db, null, (tx) =>
        tx.query("select public.submit_legal_notice('listing', $1, 'https://x.es/a', 'fraud', 'corto', 'Ana', 'a@b.es', true, $2, $3)", [
          listing, h("ip"), h("a@b.es"),
        ]),
      ),
    ).rejects.toThrow(/legal_notices_explanation_len/);
  });

  it("limita a 10 notificaciones por email y día", async () => {
    const owner = await createUser(db, "Muy Denunciado");
    const listing = (await createActiveListing(db, owner)).id;
    for (let i = 0; i < 10; i++) await submit(null, { type: "listing", id: listing, email: "pesado@x.es", ip: `ip-${i}` });
    await expect(submit(null, { type: "listing", id: listing, email: "pesado@x.es", ip: "ip-nueva" })).rejects.toThrow(/muchas notificaciones/);
  });

  it("solo los admins las leen y nadie las escribe ni las cambia directamente", async () => {
    const owner = await createUser(db, "Dueño Leído");
    const listing = (await createActiveListing(db, owner)).id;
    const ref = await submit(null, { type: "listing", id: listing });
    expect((await as(db, owner, (tx) => tx.query("select * from public.legal_notices where reference = $1", [ref]))).rows).toEqual([]);
    const admin = await makeAdmin("Admin Notificaciones");
    expect((await as(db, admin, (tx) => tx.query("select * from public.legal_notices where reference = $1", [ref]))).rows).toHaveLength(1);
    await expect(as(db, null, (tx) => tx.query("select * from public.legal_notices"))).rejects.toThrow(/permission denied/);
    await expect(
      as(db, admin, (tx) => tx.query("update public.legal_notices set status = 'rejected' where reference = $1", [ref])),
    ).rejects.toThrow(/permission denied/);
  });

  it("la decisión exige motivo, solo la toma un admin y queda en el registro", async () => {
    const owner = await createUser(db, "Dueño Decidido");
    const listing = (await createActiveListing(db, owner)).id;
    const ref = await submit(null, { type: "listing", id: listing });
    const { rows } = await db.query<{ id: string }>("select id from public.legal_notices where reference = $1", [ref]);
    const admin = await makeAdmin("Admin Decide");

    await expect(
      as(db, owner, (tx) => tx.query("select public.admin_decide_legal_notice($1, 'rejected', 'No veo nada ilícito aquí')", [rows[0].id])),
    ).rejects.toThrow(/Solo administradores/);
    await expect(
      as(db, admin, (tx) => tx.query("select public.admin_decide_legal_notice($1, 'rejected', 'corto')", [rows[0].id])),
    ).rejects.toThrow(/Motiva la decisión/);

    await as(db, admin, (tx) => tx.query("select public.admin_close_listing($1, 'Anuncio fraudulento confirmado')", [listing]));
    await as(db, admin, (tx) =>
      tx.query("select public.admin_decide_legal_notice($1, 'actioned', 'Comprobado: era fraudulento, se ha cerrado el anuncio')", [rows[0].id]),
    );
    const log = await db.query<{ action: string }>(
      "select action from public.moderation_log where target_id = any($1) order by id",
      [[rows[0].id, listing]],
    );
    expect(log.rows.map((r) => r.action)).toEqual(["listing_closed", "notice_actioned"]);
    // El dueño recibe la motivación (art. 17).
    const n = await db.query<{ kind: string; body: string }>("select kind, body from public.notifications where user_id = $1", [owner]);
    expect(n.rows[0]).toMatchObject({ kind: "content_removed" });
    expect(n.rows[0].body).toContain("Anuncio fraudulento confirmado");
    await expect(
      as(db, admin, (tx) => tx.query("select public.admin_decide_legal_notice($1, 'rejected', 'Otra vez la misma decisión')", [rows[0].id])),
    ).rejects.toThrow(/ya decidida/);
  });
});

describe("motivación en las denuncias internas (art. 17)", () => {
  it("avisa a quien denunció de la decisión y al autor si se elimina su reseña", async () => {
    const w = await createWorld(db);
    const admin = await makeAdmin("Admin Motiva");
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    const report = await as(db, w.stranger, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.reports (reporter_id, target_review_id, reason) values ($1, $2, 'offensive') returning id", [w.stranger, r.id])).rows[0].id,
    );
    await as(db, admin, (tx) => tx.query("select public.delete_review($1, 'Moderación: contiene insultos graves')", [r.id]));
    await as(db, admin, (tx) =>
      tx.query("update public.reports set status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = 'Contenía insultos' where id = $1", [report, admin]),
    );
    const byUser = async (u: string) => (await db.query<{ kind: string; body: string }>("select kind, body from public.notifications where user_id = $1", [u])).rows;
    expect(await byUser(w.stranger)).toEqual([expect.objectContaining({ kind: "report_decision", body: "Motivo: Contenía insultos" })]);
    expect((await byUser(w.guest))[0]).toMatchObject({ kind: "content_removed" });
    expect((await byUser(w.guest))[0].body).toContain("insultos graves");
  });
});
