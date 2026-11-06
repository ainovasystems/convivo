import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Auditoría de seguridad: cada test es un ATAQUE de un usuario normal (o
 * anónimo) que debe fallar. Si alguno pasa a "funcionar", hay una fuga.
 */
import { BODY, createActiveListing, createWorld, CRITERIA, writeReview } from "./fixtures";
import { as, createTestDb, createUser, sysInsert, type Db, type Tx } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const MSG = "Hola, me encaja mucho la habitación. ¿Podría verla esta semana?";

const count = async (tx: Tx, sql: string, params: unknown[] = []) =>
  (await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) t`, params)).rows[0].n;

async function interestIn(user: string, listing: string) {
  return as(db, user, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id",
      [listing, user, MSG],
    );
    return rows[0].id;
  });
}
const setStatus = (actor: string, interest: string, status: string) =>
  as(db, actor, (tx) => tx.query("update public.interests set status = $2::public.interest_status where id = $1", [interest, status]));

async function addressWorld() {
  const owner = await createUser(db, "Dueña Dirección");
  const listing = (await createActiveListing(db, owner)).id;
  await sysInsert(db, "insert into public.listing_addresses (listing_id, address_line) values ($1, 'Rúa Secreta 1')", [listing]);
  return { owner, listing };
}
const seesAddress = (viewer: string | null, listing: string) =>
  as(db, viewer, (tx) => count(tx, "select 1 from public.listing_addresses where listing_id = $1", [listing]));

// -----------------------------------------------------------------------------
describe("dirección exacta", () => {
  it("no la ven anónimos, extraños ni interesados pendientes, rechazados o retirados", async () => {
    const { owner, listing } = await addressWorld();
    expect(await seesAddress(owner, listing)).toBe(1);
    // Un anónimo ni siquiera tiene permiso sobre la tabla.
    await expect(seesAddress(null, listing)).rejects.toThrow(/permission denied/);
    expect(await seesAddress(await createUser(db, "Extraño"), listing)).toBe(0);

    const pending = await createUser(db, "Pendiente");
    await interestIn(pending, listing);
    expect(await seesAddress(pending, listing)).toBe(0);

    const declined = await createUser(db, "Rechazado");
    await setStatus(owner, await interestIn(declined, listing), "declined");
    expect(await seesAddress(declined, listing)).toBe(0);

    const withdrawn = await createUser(db, "Retirado");
    const w = await interestIn(withdrawn, listing);
    await setStatus(owner, w, "accepted");
    expect(await seesAddress(withdrawn, listing)).toBe(1);
    await setStatus(withdrawn, w, "withdrawn");
    expect(await seesAddress(withdrawn, listing)).toBe(0);
  });

  it("nadie más que el dueño la escribe o la borra", async () => {
    const { owner, listing } = await addressWorld();
    const accepted = await createUser(db, "Aceptado");
    await setStatus(owner, await interestIn(accepted, listing), "accepted");
    for (const attacker of [accepted, await createUser(db, "Otro")]) {
      const upd = await as(db, attacker, (tx) =>
        tx.query("update public.listing_addresses set address_line = 'Hackeada' where listing_id = $1", [listing]),
      );
      expect(upd.affectedRows).toBe(0);
      const del = await as(db, attacker, (tx) => tx.query("delete from public.listing_addresses where listing_id = $1", [listing]));
      expect(del.affectedRows).toBe(0);
    }
    await expect(
      as(db, null, (tx) => tx.query("insert into public.listing_addresses (listing_id, address_line) values ($1, 'x')", [listing])),
    ).rejects.toThrow(/permission denied/);
  });
});

// -----------------------------------------------------------------------------
describe("conversaciones ajenas", () => {
  async function conversation() {
    const owner = await createUser(db, "Anunciante");
    const listing = (await createActiveListing(db, owner)).id;
    const guest = await createUser(db, "Interesada");
    const interest = await interestIn(guest, listing);
    return { owner, guest, interest, attacker: await createUser(db, "Fisgón") };
  }

  it("un tercero no lee intereses ni mensajes, ni escribe en ellos", async () => {
    const { interest, attacker, guest } = await conversation();
    await as(db, attacker, async (tx) => {
      expect(await count(tx, "select 1 from public.interests where id = $1", [interest])).toBe(0);
      expect(await count(tx, "select 1 from public.messages where interest_id = $1", [interest])).toBe(0);
    });
    expect(await as(db, null, (tx) => count(tx, "select 1 from public.messages")).catch((e) => String(e))).toMatch(
      /permission denied/,
    );
    await expect(
      as(db, attacker, (tx) =>
        tx.query("insert into public.messages (interest_id, sender_id, body) values ($1, $2, 'hola')", [interest, attacker]),
      ),
    ).rejects.toThrow(/row-level security|No formas parte/);
    // Suplantar al interesado tampoco cuela.
    await expect(
      as(db, attacker, (tx) =>
        tx.query("insert into public.messages (interest_id, sender_id, body) values ($1, $2, 'hola')", [interest, guest]),
      ),
    ).rejects.toThrow(/row-level security|No formas parte/);
  });

  it("un tercero no marca como leída una conversación ajena ni ve los contadores", async () => {
    const { interest, attacker } = await conversation();
    await expect(as(db, attacker, (tx) => tx.query("select public.mark_conversation_read($1)", [interest]))).rejects.toThrow(
      /Conversación no encontrada/,
    );
    await as(db, attacker, async (tx) => {
      expect(await count(tx, "select 1 from public.conversation_reads where interest_id = $1", [interest])).toBe(0);
      expect(await count(tx, "select * from public.my_unread_counts() where interest_id = $1", [interest])).toBe(0);
    });
    await expect(
      as(db, attacker, (tx) =>
        tx.query("insert into public.conversation_reads (interest_id, user_id, last_read_at) values ($1, $2, now())", [
          interest,
          attacker,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("no se salta la máquina de estados de los intereses", async () => {
    const { owner, guest, interest, attacker } = await conversation();
    // El interesado no se acepta a sí mismo; un tercero no toca nada.
    await expect(setStatus(guest, interest, "accepted")).rejects.toThrow(/Solo el anunciante/);
    expect((await setStatus(attacker, interest, "declined")).affectedRows).toBe(0);
    // Ni cambiar columnas que no sean el estado.
    await expect(
      as(db, owner, (tx) => tx.query("update public.interests set message = 'cambiado' where id = $1", [interest])),
    ).rejects.toThrow(/permission denied/);
    // Retirado es final.
    await setStatus(guest, interest, "withdrawn");
    await expect(setStatus(owner, interest, "accepted")).rejects.toThrow();
    // Los mensajes no se editan ni se borran.
    await expect(
      as(db, guest, (tx) => tx.query("update public.messages set body = 'editado' where interest_id = $1", [interest])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, guest, (tx) => tx.query("delete from public.messages where interest_id = $1", [interest]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

// -----------------------------------------------------------------------------
describe("reseñas", () => {
  it("terceros no ven una reseña antes de published_at; el autor sí", async () => {
    const w = await createWorld(db);
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    expect(new Date(r.published_at).getTime()).toBeGreaterThan(Date.now());
    for (const viewer of [null, w.stranger, w.host, w.flatmate]) {
      expect(await as(db, viewer, (tx) => count(tx, "select 1 from public.reviews where id = $1", [r.id]))).toBe(0);
    }
    expect(await as(db, w.guest, (tx) => count(tx, "select 1 from public.reviews where id = $1", [r.id]))).toBe(1);
  });

  it("una reseña oculta por datos personales no la ven terceros ni cuenta en las medias", async () => {
    const w = await createWorld(db);
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await db.query("update public.reviews set published_at = now() - interval '1 day' where id = $1", [r.id]);
    expect(await as(db, w.stranger, (tx) => count(tx, "select 1 from public.reviews where id = $1", [r.id]))).toBe(1);

    await as(db, w.stranger, (tx) =>
      tx.query("insert into public.reports (reporter_id, target_review_id, reason) values ($1, $2, 'personal_data')", [
        w.stranger,
        r.id,
      ]),
    );
    expect(await as(db, w.stranger, (tx) => count(tx, "select 1 from public.reviews where id = $1", [r.id]))).toBe(0);
    expect(await as(db, null, (tx) => count(tx, "select 1 from public.reviews where id = $1", [r.id]))).toBe(0);
    const stats = await as(db, null, (tx) =>
      tx.query<{ review_count: number }>("select * from public.profile_review_stats($1)", [w.host]),
    );
    expect(stats.rows.reduce((n, s) => n + Number(s.review_count ?? 0), 0)).toBe(0);
  });

  it("no se reseña sin estancia confirmada, sin formar parte ni sobre un sujeto inválido", async () => {
    const w = await createWorld(db);
    // Un extraño (o un compañero sin confirmar) no forma parte de la estancia.
    for (const author of [w.stranger, w.pendingFlatmate]) {
      await expect(
        writeReview(db, { stay: w.stay, author, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
      ).rejects.toThrow();
    }
    // Firmar como otro.
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }, w.stranger),
    ).rejects.toThrow(/row-level security|en tu nombre/);
    // El host no reseña su propio inmueble; nadie reseña a un extraño.
    await expect(
      writeReview(db, { stay: w.stay, author: w.host, subjectListing: w.listing, criteria: CRITERIA.tenant_to_listing }),
    ).rejects.toThrow();
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.stranger, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow();

    // Estancia propuesta pero sin confirmar por las dos partes.
    const unconfirmed = await sysInsert<{ id: string }>(
      db,
      `insert into public.stays (listing_id, host_id, guest_id, start_date, status, host_confirmed_at)
       values ($1, $2, $3, current_date - 90, 'proposed', now()) returning id`,
      [w.listing, w.host, w.stranger],
    );
    await expect(
      writeReview(db, { stay: unconfirmed.id, author: w.stranger, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow();
  });

  it("no se editan ni se borran directamente, tampoco con service_role", async () => {
    const w = await createWorld(db);
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await expect(
      as(db, w.guest, (tx) => tx.query("update public.reviews set body = $2 where id = $1", [r.id, `${BODY} Editada.`])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, w.guest, (tx) => tx.query("delete from public.reviews where id = $1", [r.id]))).rejects.toThrow(
      /permission denied/,
    );

    const asService = <T>(fn: (tx: Tx) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return fn(tx);
      });
    await db.query("grant update, delete on public.reviews to service_role");
    await expect(
      asService((tx) => tx.query("update public.reviews set body = $2 where id = $1", [r.id, `${BODY} Editada.`])),
    ).rejects.toThrow(/no se pueden editar/);
    await expect(asService((tx) => tx.query("update public.reviews set rating = 1 where id = $1", [r.id]))).rejects.toThrow(
      /no se pueden editar/,
    );
    await expect(asService((tx) => tx.query("delete from public.reviews where id = $1", [r.id]))).rejects.toThrow(
      /no se borran/,
    );
  });

  it("delete_review y admin_review_flags no sirven a quien no es autor ni admin", async () => {
    const w = await createWorld(db);
    const r = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    // El reseñado no puede borrar la reseña que le molesta.
    await expect(
      as(db, w.host, (tx) => tx.query("select public.delete_review($1, 'No me gusta esta reseña')", [r.id])),
    ).rejects.toThrow(/no encontrada/);
    await expect(as(db, w.stranger, (tx) => tx.query("select * from public.admin_review_flags()"))).rejects.toThrow();
    await expect(as(db, null, (tx) => tx.query("select * from public.admin_review_flags()"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

// -----------------------------------------------------------------------------
describe("escrituras cruzadas", () => {
  it("stays y stay_participants no admiten UPDATE ni DELETE directos", async () => {
    const w = await createWorld(db, { windowNotOpenYet: true });
    for (const actor of [w.host, w.guest]) {
      await expect(
        as(db, actor, (tx) => tx.query("update public.stays set status = 'ended' where id = $1", [w.stay])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as(db, actor, (tx) => tx.query("update public.stay_participants set confirmed_at = now() where stay_id = $1", [w.stay])),
      ).rejects.toThrow(/permission denied/);
      await expect(as(db, actor, (tx) => tx.query("delete from public.stays where id = $1", [w.stay]))).rejects.toThrow(
        /permission denied/,
      );
    }
    // Un compañero pendiente no se confirma insertándose.
    await expect(
      as(db, w.stranger, (tx) =>
        tx.query("insert into public.stay_participants (stay_id, user_id, confirmed_at) values ($1, $2, now())", [
          w.stay,
          w.stranger,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    // Ni crear una estancia ya confirmada.
    await expect(
      as(db, w.guest, (tx) =>
        tx.query(
          `insert into public.stays (listing_id, host_id, guest_id, start_date, status, host_confirmed_at, guest_confirmed_at)
           values ($1, $2, $3, current_date - 60, 'active', now(), now())`,
          [w.listing, w.host, w.guest],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("no se cambia el owner_id ni se escribe en anuncios o perfiles ajenos", async () => {
    const owner = await createUser(db, "Propietaria");
    const attacker = await createUser(db, "Ladrón");
    const listing = (await createActiveListing(db, owner)).id;
    await expect(
      as(db, owner, (tx) => tx.query("update public.listings set owner_id = $2 where id = $1", [listing, attacker])),
    ).rejects.toThrow(/propietario/);
    expect(
      (await as(db, attacker, (tx) => tx.query("update public.listings set owner_id = $2 where id = $1", [listing, attacker])))
        .affectedRows,
    ).toBe(0);
    expect(
      (await as(db, attacker, (tx) => tx.query("update public.profiles set display_name = 'Hackeado' where id = $1", [owner])))
        .affectedRows,
    ).toBe(0);
    await expect(
      as(db, owner, (tx) => tx.query("update public.profiles set email_verified = true where id = $1", [owner])),
    ).rejects.toThrow(/permission denied/);
  });

  it("los estados del anuncio no se saltan: un publicado no vuelve a borrador y un cerrado es definitivo", async () => {
    const owner = await createUser(db, "Dueño Estados");
    const listing = (await createActiveListing(db, owner)).id;
    const set = (status: string) =>
      as(db, owner, (tx) => tx.query("update public.listings set status = $2::public.listing_status where id = $1", [listing, status]));
    // Volver a borrador permitiría borrarlo y arrastrar las conversaciones de otros.
    await expect(set("draft")).rejects.toThrow(/borrador/);
    await set("paused");
    await set("active");
    await set("closed");
    await expect(set("active")).rejects.toThrow(/cerrado/);
    await expect(set("paused")).rejects.toThrow(/cerrado/);
  });

  it("las fotos de un anuncio solo pueden ser rutas de su propia carpeta", async () => {
    const owner = await createUser(db, "Fotógrafa");
    const other = await createUser(db, "Otra");
    const listing = (await createActiveListing(db, owner)).id;
    const setPhotos = (photos: string[]) =>
      as(db, owner, (tx) => tx.query("update public.listings set photos = $2 where id = $1", [listing, photos]));
    await setPhotos([`${owner}/${listing}/a.webp`]);
    await expect(setPhotos([`${other}/x/foto.webp`])).rejects.toThrow(/listings_photos_own_folder/);
    await expect(setPhotos(["https://tracker.example/pixel.gif"])).rejects.toThrow(/listings_photos_own_folder/);
  });
});

// -----------------------------------------------------------------------------
describe("tablas internas", () => {
  it("user_signals, review_window_notices y admin_users no se leen ni se escriben", async () => {
    const u = await createUser(db, "Curiosa");
    for (const viewer of [null, u]) {
      for (const table of ["user_signals", "review_window_notices", "admin_users"]) {
        await expect(as(db, viewer, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      }
    }
    await expect(
      as(db, u, (tx) => tx.query("insert into public.admin_users (user_id) values ($1)", [u])),
    ).rejects.toThrow(/permission denied/);
    // La propia comprobación de admin no se puede falsear.
    expect((await as(db, u, (tx) => tx.query<{ a: boolean }>("select public.am_i_admin() as a"))).rows[0].a).toBe(false);
  });

  it("las notificaciones ajenas no se leen ni se marcan; las propias no se inventan", async () => {
    const owner = await createUser(db, "Notificada");
    const attacker = await createUser(db, "Intrusa");
    const n = await sysInsert<{ id: string }>(
      db,
      "insert into public.notifications (user_id, kind, title, body) values ($1, 'review_window_opened', 'Hola', 'Texto') returning id",
      [owner],
    );
    await as(db, attacker, async (tx) => {
      expect(await count(tx, "select 1 from public.notifications where id = $1", [n.id])).toBe(0);
      expect((await tx.query("update public.notifications set read_at = now() where id = $1", [n.id])).affectedRows).toBe(0);
    });
    await expect(
      as(db, attacker, (tx) =>
        tx.query("insert into public.notifications (user_id, kind, title, body) values ($1, 'review_window_opened', 'x', 'y')", [
          attacker,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, owner, (tx) => tx.query("update public.notifications set title = 'cambiado' where id = $1", [n.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("review_window_notices_due solo la ejecuta service_role", async () => {
    const u = await createUser(db, "Cotilla");
    for (const viewer of [null, u]) {
      await expect(as(db, viewer, (tx) => tx.query("select * from public.review_window_notices_due()"))).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

// -----------------------------------------------------------------------------
describe("storage", () => {
  async function seedObject(bucket: string, owner: string) {
    const name = `${owner}/x/${Math.random().toString(36).slice(2)}.webp`;
    await db.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, owner]);
    return name;
  }

  for (const bucket of ["avatars", "listing-photos"]) {
    it(`${bucket}: no se escribe, se mueve ni se borra en la carpeta de otro`, async () => {
      const victim = await createUser(db, "Víctima");
      const attacker = await createUser(db, "Atacante");
      const name = await seedObject(bucket, victim);
      await as(db, attacker, async (tx) => {
        expect((await tx.query("delete from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).affectedRows).toBe(0);
        expect(
          (await tx.query("update storage.objects set name = $3 where bucket_id = $1 and name = $2", [bucket, name, `${attacker}/robada.webp`]))
            .affectedRows,
        ).toBe(0);
      });
      await expect(
        as(db, attacker, (tx) =>
          tx.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, `${victim}/falsa.webp`, attacker]),
        ),
      ).rejects.toThrow(/row-level security/);
      // Ni moviendo un fichero propio a la carpeta de la víctima.
      const own = await seedObject(bucket, attacker);
      await expect(
        as(db, attacker, (tx) =>
          tx.query("update storage.objects set name = $3 where bucket_id = $1 and name = $2", [bucket, own, `${victim}/movida.webp`]),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as(db, null, (tx) =>
          tx.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, `${victim}/anon.webp`]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  }
});

// -----------------------------------------------------------------------------
describe("superficie expuesta", () => {
  it("todas las tablas de public tienen RLS activada", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("anon solo puede ejecutar las funciones públicas de lectura previstas", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["listing_review_stats", "profile_review_stats", "review_criteria_for"]);
  });
});
