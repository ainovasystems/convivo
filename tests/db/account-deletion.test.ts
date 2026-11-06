import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActiveListing, createWorld, CRITERIA, writeReview } from "./fixtures";
import { as, createTestDb, createUser, sysInsert, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const MSG = "Hola, me encaja mucho la habitación. ¿Podría verla esta semana?";
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const n = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) t`, params)).n);
const deleteAccount = (user: string, confirm = "BORRAR") =>
  as(db, user, (tx) => tx.query("select public.delete_my_account($1)", [confirm]));

describe("borrar mi cuenta", () => {
  it("exige sesión y escribir BORRAR", async () => {
    const u = await createUser(db, "Indecisa");
    await expect(deleteAccount(u, "borrar")).rejects.toThrow(/escribe BORRAR/);
    await expect(as(db, null, (tx) => tx.query("select public.delete_my_account('BORRAR')"))).rejects.toThrow(
      /permission denied/,
    );
    expect(await n("select 1 from auth.users where id = $1", [u])).toBe(1);
  });

  it("anonimiza el perfil y conserva las reseñas (escritas y recibidas) y sus medias", async () => {
    const w = await createWorld(db);
    const byHost = await writeReview(db, {
      stay: w.stay, author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant, rating: 4,
    });
    const aboutHost = await writeReview(db, {
      stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord, rating: 2,
    });
    await db.query("update public.profiles set bio = 'Me encanta cocinar', city = 'Lugo' where id = $1", [w.host]);
    const statsBefore = (await db.query("select * from public.profile_review_stats($1)", [w.host])).rows;

    await deleteAccount(w.host);

    expect(await n("select 1 from auth.users where id = $1", [w.host])).toBe(0);
    const p = await one<{ display_name: string; bio: string | null; city: string | null; deleted_at: Date | null }>(
      "select display_name, bio, city, deleted_at from public.profiles where id = $1",
      [w.host],
    );
    expect(p).toMatchObject({ display_name: "Usuario eliminado", bio: null, city: null });
    expect(p.deleted_at).not.toBeNull();

    // Las reseñas siguen ahí, intactas y con el mismo autor/sujeto (ahora anónimo).
    expect(await n("select 1 from public.reviews where id = any($1) and deleted_at is null", [[byHost.id, aboutHost.id]])).toBe(2);
    expect((await db.query("select * from public.profile_review_stats($1)", [w.host])).rows).toEqual(statsBefore);
    // Y el guest sigue viendo la reseña que le escribió el host (en cuanto sea pública).
    await db.query("update public.reviews set published_at = now() - interval '1 minute' where id = $1", [byHost.id]);
    expect(await as(db, w.stranger, (tx) => tx.query("select 1 from public.reviews where id = $1", [byHost.id])).then((r) => r.rows.length)).toBe(1);
  });

  it("borra conversaciones, avisos y señales; cierra los anuncios con estancias y borra los demás", async () => {
    const w = await createWorld(db);
    const spare = (await createActiveListing(db, w.host)).id;
    await sysInsert(db, "insert into public.listing_addresses (listing_id, address_line) values ($1, 'Rúa 1')", [w.listing]);
    await db.query("update public.listings set photos = $2 where id = $1", [w.listing, [`${w.host}/${w.listing}/a.webp`]]);
    // Conversaciones en sus dos papeles.
    const asHost = await as(db, w.stranger, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [spare, w.stranger, MSG])).rows[0].id,
    );
    const other = await createUser(db, "Otra Anunciante");
    const otherListing = (await createActiveListing(db, other)).id;
    const asGuest = await as(db, w.host, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [otherListing, w.host, MSG])).rows[0].id,
    );
    await sysInsert(db, "insert into public.notifications (user_id, kind, title) values ($1, 'review_window_opened', 'Hola')", [w.host]);
    await sysInsert(db, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [other, w.host]);
    await sysInsert(db, "insert into public.user_signals (user_id, ip_hash, ua_hash) values ($1, repeat('a', 64), repeat('b', 64))", [w.host]);

    await deleteAccount(w.host);

    expect(await n("select 1 from public.interests where id = any($1)", [[asHost, asGuest]])).toBe(0);
    expect(await n("select 1 from public.messages where sender_id = $1", [w.host])).toBe(0);
    expect(await n("select 1 from public.notifications where user_id = $1", [w.host])).toBe(0);
    expect(await n("select 1 from public.blocks where blocked_id = $1", [w.host])).toBe(0);
    expect(await n("select 1 from public.user_signals where user_id = $1", [w.host])).toBe(0);
    expect(await n("select 1 from public.listings where id = $1", [spare])).toBe(0);
    const kept = await one<{ status: string; photos: string[] }>("select status, photos from public.listings where id = $1", [w.listing]);
    expect(kept).toEqual({ status: "closed", photos: [] });
    expect(await n("select 1 from public.listing_addresses where listing_id = $1", [w.listing])).toBe(0);
    // La estancia sigue: sostiene las reseñas.
    expect(await n("select 1 from public.stays where id = $1", [w.stay])).toBe(1);
    // El anuncio cerrado sigue siendo definitivo para cualquiera.
    await expect(
      as(db, other, (tx) => tx.query("update public.listings set status = 'active' where id = $1", [w.listing])),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });

  it("borrar desde el panel de Supabase (sin pasar por la app) también anonimiza", async () => {
    const w = await createWorld(db);
    await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await db.query("delete from auth.users where id = $1", [w.guest]);
    expect(await n("select 1 from public.reviews where author_id = $1", [w.guest])).toBe(1);
    expect((await one<{ display_name: string }>("select display_name from public.profiles where id = $1", [w.guest])).display_name).toBe(
      "Usuario eliminado",
    );
  });
});
