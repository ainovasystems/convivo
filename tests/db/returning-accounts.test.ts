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

async function register(email: string, name = "Vuelve Otra Vez") {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), $1, now(), jsonb_build_object('display_name', $2::text), now(), now()) returning id`,
    [email, name],
  );
  return rows[0].id;
}
const restoredFrom = async (id: string) =>
  (await db.query<{ restored_from: string | null }>("select restored_from from public.profiles where id = $1", [id])).rows[0].restored_from;
const statsCount = async (id: string) =>
  (await as(db, null, (tx) => tx.query<{ review_count: number }>("select * from public.profile_review_stats($1)", [id]))).rows.reduce(
    (n, r) => n + Number(r.review_count),
    0,
  );

async function hostWithBadReview(email: string) {
  const w = await createWorld(db);
  await db.query("update auth.users set email = $2 where id = $1", [w.host, email]);
  const r = await writeReview(db, {
    stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord, rating: 1,
  });
  await db.query("update public.reviews set published_at = now() - interval '1 day' where id = $1", [r.id]);
  return { ...w, review: r.id };
}

describe("cuentas que se borran y vuelven", () => {
  it("con el mismo email, la cuenta nueva recupera el historial de reseñas", async () => {
    const w = await hostWithBadReview("Casero.Malo@Ejemplo.es");
    expect(await statsCount(w.host)).toBe(1);
    await as(db, w.host, (tx) => tx.query("select public.delete_my_account('BORRAR')"));

    // Mismo email con otras mayúsculas y espacios.
    const again = await register("  casero.malo@ejemplo.es ");
    expect(await restoredFrom(again)).toBe(w.host);
    expect(await statsCount(again)).toBe(1);
    const lineage = await as(db, null, (tx) => tx.query<{ l: string[] }>("select public.profile_lineage($1) as l", [again]));
    expect(lineage.rows[0].l).toEqual([again, w.host]);

    // Una tercera cuenta con el mismo email no vuelve a reclamar el mismo historial.
    await as(db, again, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    const third = await register("casero.malo@ejemplo.es");
    expect(await restoredFrom(third)).toBe(again);
    expect(await statsCount(third)).toBe(1);
  });

  it("con otro email no se enlaza, y la huella guardada no es el email", async () => {
    const w = await hostWithBadReview("otra.persona@ejemplo.es");
    await as(db, w.host, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    const other = await register("distinta@ejemplo.es");
    expect(await restoredFrom(other)).toBeNull();
    const { rows } = await db.query<{ email_hash: string }>(
      "select email_hash from private.deleted_account_traces where profile_id = $1",
      [w.host],
    );
    expect(rows[0].email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].email_hash).not.toContain("otra.persona");
  });

  it("caduca a los 2 años", async () => {
    const w = await hostWithBadReview("antigua@ejemplo.es");
    await as(db, w.host, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    await db.query("update private.deleted_account_traces set expires_at = now() - interval '1 day' where profile_id = $1", [w.host]);
    expect(await restoredFrom(await register("antigua@ejemplo.es"))).toBeNull();
  });

  it("avisa al admin si una cuenta nueva comparte conexión con una borrada con malas reseñas", async () => {
    const w = await hostWithBadReview("se.escapa@ejemplo.es");
    const ip = "a".repeat(64);
    await sysInsert(db, "insert into public.user_signals (user_id, ip_hash, ua_hash) values ($1, $2, $3)", [w.host, ip, "b".repeat(64)]);
    await as(db, w.host, (tx) => tx.query("select public.delete_my_account('BORRAR')"));

    const sneaky = await register("cuenta.nueva@ejemplo.es", "Nombre Nuevo");
    await sysInsert(db, "insert into public.user_signals (user_id, ip_hash, ua_hash) values ($1, $2, $3)", [sneaky, ip, "c".repeat(64)]);

    const admin = await createUser(db, "Admin Vigila");
    await db.query("insert into public.admin_users (user_id) values ($1)", [admin]);
    const flags = await as(db, admin, (tx) =>
      tx.query<{ profile_id: string; previous_profile_id: string; negative_reviews: number; shared_device: boolean }>(
        "select * from public.admin_returning_account_flags()",
      ),
    );
    expect(flags.rows).toContainEqual(
      expect.objectContaining({ profile_id: sneaky, previous_profile_id: w.host, negative_reviews: 1, shared_device: false }),
    );
    await expect(as(db, sneaky, (tx) => tx.query("select * from public.admin_returning_account_flags()"))).rejects.toThrow(
      /Solo administradores/,
    );
  });

  it("nadie lee las huellas ni la clave, ni puede ponerse un historial ajeno", async () => {
    const u = await createUser(db, "Fisgona Huellas");
    for (const sql of ["select * from private.deleted_account_traces", "select * from private.app_secrets"]) {
      await expect(as(db, u, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    const victim = await createUser(db, "Con Buen Historial");
    await expect(
      as(db, u, (tx) => tx.query("update public.profiles set restored_from = $2 where id = $1", [u, victim])),
    ).rejects.toThrow(/permission denied/);
  });
});
