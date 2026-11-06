import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWorld, CRITERIA, writeReview } from "./fixtures";
import { as, createTestDb, createUser, sysInsert, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const DESC = "Habitación exterior en piso reformado, cerca de todo y con buena convivencia.";

async function publish(owner: string, opts: { rent: number; city?: string; province?: string; description?: string; kind?: string }) {
  return as(db, owner, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.listings (owner_id, kind, status, title, description, city, province, monthly_rent, available_from, current_flatmates)
       values ($1, $2::public.listing_kind, 'active', 'Habitación luminosa en el centro', $3, $4, $5, $6, current_date, case when $2 = 'room' then 1 end)
       returning id`,
      [owner, opts.kind ?? "room", opts.description ?? DESC, opts.city ?? "Lugo", opts.province ?? "Lugo", opts.rent],
    );
    return rows[0].id;
  });
}
const flags = async (listing: string) =>
  (await db.query<{ reason: string; details: string; status: string }>(
    "select reason, details, status from public.listing_flags where listing_id = $1 order by reason",
    [listing],
  )).rows;

async function makeAdmin(name: string) {
  const id = await createUser(db, name);
  await db.query("insert into public.admin_users (user_id) values ($1)", [id]);
  return id;
}

describe("marcas anti-fraude", () => {
  it("marca textos típicos de estafa sin despublicar el anuncio", async () => {
    const owner = await createUser(db, "Estafador");
    for (const text of [
      "Estoy en el extranjero por trabajo, te mando las llaves por mensajería.",
      "Para reservar, paga por adelantado la fianza por Western Union.",
      "El pago es por MoneyGram antes de ver el piso.",
    ]) {
      const id = await publish(owner, { rent: 300, description: `${DESC} ${text}` });
      const f = await flags(id);
      expect(f.map((x) => x.reason)).toContain("payment_scam");
      const { rows } = await db.query<{ status: string }>("select status from public.listings where id = $1", [id]);
      expect(rows[0].status).toBe("active");
    }
    // Un texto normal no se marca.
    expect(await flags(await publish(owner, { rent: 300 }))).toEqual([]);
  });

  it("precio muy bajo frente a la mediana de la ciudad, de la provincia o un mínimo absoluto", async () => {
    const owner = await createUser(db, "Casera");
    // Sin comparables en Teruel: umbral absoluto de 120 € para habitaciones.
    expect((await flags(await publish(owner, { rent: 90, city: "Teruel", province: "Teruel" })))[0]?.details).toMatch(/mínimo razonable/);
    expect(await flags(await publish(owner, { rent: 200, city: "Teruel", province: "Teruel" }))).toEqual([]);

    // Cinco comparables en Soria (mediana 400): 150 € es menos de la mitad.
    for (const rent of [380, 390, 400, 410, 420]) await publish(owner, { rent, city: "Soria", province: "Soria" });
    const cheap = await publish(owner, { rent: 150, city: "Soria", province: "Soria" });
    expect((await flags(cheap))[0]).toMatchObject({ reason: "low_price" });
    expect((await flags(cheap))[0].details).toMatch(/mediana de la ciudad \(400/);
    expect(await flags(await publish(owner, { rent: 250, city: "Soria", province: "Soria" }))).toEqual([]);
    // En otro pueblo de la provincia se compara con la provincia.
    expect((await flags(await publish(owner, { rent: 120, city: "Almazán", province: "Soria" })))[0].details).toMatch(/provincia/);
  });

  it("solo los admins ven las marcas y nadie las escribe directamente", async () => {
    const owner = await createUser(db, "Dueño Marcado");
    const id = await publish(owner, { rent: 300, description: `${DESC} Pago por Western Union.` });
    const admin = await makeAdmin("Admin Fraude");
    for (const viewer of [owner, await createUser(db, "Curioso")]) {
      expect((await as(db, viewer, (tx) => tx.query("select * from public.listing_flags where listing_id = $1", [id]))).rows).toEqual([]);
    }
    expect((await as(db, admin, (tx) => tx.query("select * from public.listing_flags where listing_id = $1", [id]))).rows).toHaveLength(1);
    await expect(
      as(db, owner, (tx) => tx.query("update public.listing_flags set status = 'dismissed' where listing_id = $1", [id])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, null, (tx) => tx.query("select * from public.listing_flags"))).rejects.toThrow(/permission denied/);
  });

  it("revisar una marca: descartar o cerrar el anuncio, y queda en el registro", async () => {
    const owner = await createUser(db, "Dueña Revisada");
    const admin = await makeAdmin("Admin Revisión");
    const ok = await publish(owner, { rent: 300, description: `${DESC} Puedes pagar con bitcoin si prefieres.` });
    const bad = await publish(owner, { rent: 300, description: `${DESC} Estoy en el extranjero, te envío las llaves.` });
    const flagOf = async (l: string) => (await db.query<{ id: string }>("select id from public.listing_flags where listing_id = $1", [l])).rows[0].id;

    const okFlagFirst = await flagOf(ok);
    await expect(
      as(db, owner, (tx) => tx.query("select public.admin_resolve_listing_flag($1, 'dismiss', 'Lo apruebo yo')", [okFlagFirst])),
    ).rejects.toThrow(/Solo administradores/);

    const okFlag = await flagOf(ok);
    await as(db, admin, (tx) => tx.query("select public.admin_resolve_listing_flag($1, 'dismiss', 'Revisado: es legítimo')", [okFlag]));
    const badFlag = await flagOf(bad);
    await as(db, admin, (tx) =>
      tx.query("select public.admin_resolve_listing_flag($1, 'close_listing', 'Estafa clásica de las llaves')", [badFlag]),
    );
    const { rows } = await db.query<{ status: string }>("select status from public.listings where id = $1", [bad]);
    expect(rows[0].status).toBe("closed");
    await expect(
      as(db, admin, (tx) => tx.query("select public.admin_resolve_listing_flag($1, 'dismiss', 'Otra vez')", [okFlag])),
    ).rejects.toThrow(/ya revisada/);

    const log = await as(db, admin, (tx) =>
      tx.query<{ action: string; actor_id: string; note: string }>(
        "select action, actor_id, note from public.moderation_log where target_type = 'listing_flag' and actor_id = $1 order by id",
        [admin],
      ),
    );
    expect(log.rows.map((r) => r.action)).toEqual(["listing_flag_dismissed", "listing_flag_actioned"]);
  });
});

describe("registro de moderación", () => {
  it("registra descartar denuncias y eliminar reseñas como admin, pero no que el autor borre la suya", async () => {
    const w = await createWorld(db);
    const admin = await makeAdmin("Admin Reseñas");
    const r1 = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    const r2 = await writeReview(db, { stay: w.stay, author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant });
    const report = await as(db, w.stranger, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.reports (reporter_id, target_review_id, reason) values ($1, $2, 'offensive') returning id", [w.stranger, r1.id])).rows[0].id,
    );
    await as(db, admin, (tx) =>
      tx.query("update public.reports set status = 'dismissed', resolved_by = $2, resolved_at = now(), resolution_note = 'No es ofensiva' where id = $1", [report, admin]),
    );
    await as(db, admin, (tx) => tx.query("select public.delete_review($1, 'Moderación: contiene insultos')", [r1.id]));
    await as(db, w.host, (tx) => tx.query("select public.delete_review($1, 'Me equivoqué de persona')", [r2.id]));

    const { rows } = await db.query<{ action: string; target_id: string; actor_id: string }>(
      "select action, target_id, actor_id from public.moderation_log where target_id = any($1) order by id",
      [[report, r1.id, r2.id]],
    );
    expect(rows).toEqual([
      { action: "report_dismissed", target_id: report, actor_id: admin },
      { action: "review_deleted", target_id: r1.id, actor_id: admin },
    ]);
  });

  it("es append-only: nadie lo modifica ni lo borra, tampoco service_role; solo lo leen admins", async () => {
    await sysInsert(db, "insert into public.moderation_log (action, target_type, target_id, note) values ('report_dismissed', 'report', gen_random_uuid(), 'x')");
    await expect(db.query("update public.moderation_log set note = 'cambiada'")).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("delete from public.moderation_log")).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("truncate public.moderation_log")).rejects.toThrow(/no se puede modificar/);
    await db.query("grant update, delete on public.moderation_log to service_role");
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        await tx.query("delete from public.moderation_log");
      }),
    ).rejects.toThrow(/no se puede modificar/);

    const user = await createUser(db, "Mirona");
    expect((await as(db, user, (tx) => tx.query("select * from public.moderation_log"))).rows).toEqual([]);
    await expect(
      as(db, user, (tx) => tx.query("insert into public.moderation_log (action, target_type, target_id) values ('report_dismissed', 'report', gen_random_uuid())")),
    ).rejects.toThrow(/permission denied/);
    const admin = await makeAdmin("Admin Lectora");
    expect((await as(db, admin, (tx) => tx.query("select * from public.moderation_log"))).rows.length).toBeGreaterThan(0);
  });
});
