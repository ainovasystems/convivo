import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, sysInsert, type Db } from "./helpers";
import { BODY, CRITERIA, createActiveListing, createWorld, visibleReviewIds, writeReview } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("regla a) solo se reseña tras una estancia confirmada y siendo parte", () => {
  it("rechaza reseñar una estancia confirmada solo por una parte", async () => {
    const w = await createWorld(db);
    const listing2 = await createActiveListing(db, w.host);
    // El guest propone una estancia retroactiva: queda confirmada solo por él.
    const proposed = await as(db, w.guest, async (tx) => {
      const { rows } = await tx.query<{ id: string; status: string; guest_confirmed_at: Date | null }>(
        `insert into public.stays (listing_id, host_id, guest_id, start_date)
         values ($1, $2, $3, current_date - 100) returning id, status, guest_confirmed_at`,
        [listing2.id, w.host, w.guest],
      );
      return rows[0];
    });
    expect(proposed.status).toBe("proposed");
    expect(proposed.guest_confirmed_at).not.toBeNull();

    await expect(
      writeReview(db, { stay: proposed.id, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/confirmada por ambas partes/);
  });

  it("rechaza reseñar sin ser parte de la estancia", async () => {
    const w = await createWorld(db);
    await expect(
      writeReview(db, { stay: w.stay, author: w.stranger, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/No formas parte/);
  });

  it("rechaza a un compañero que no confirmó su participación", async () => {
    const w = await createWorld(db);
    await expect(
      writeReview(db, {
        stay: w.stay,
        author: w.pendingFlatmate,
        subjectUser: w.guest,
        criteria: CRITERIA.flatmate_to_flatmate,
      }),
    ).rejects.toThrow(/No formas parte/);
  });

  it("rechaza suplantar al autor", async () => {
    const w = await createWorld(db);
    await expect(
      writeReview(
        db,
        { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord },
        w.stranger,
      ),
    ).rejects.toThrow(/en tu nombre|row-level security/);
  });

  it("rechaza relaciones no permitidas", async () => {
    const w = await createWorld(db);
    // El propietario no reseña su propio inmueble.
    await expect(
      writeReview(db, { stay: w.stay, author: w.host, subjectListing: w.listing, criteria: CRITERIA.tenant_to_listing }),
    ).rejects.toThrow(/Solo el inquilino/);
    // El propietario no reseña a los compañeros del piso.
    await expect(
      writeReview(db, { stay: w.stay, author: w.host, subjectUser: w.flatmate, criteria: CRITERIA.landlord_to_tenant }),
    ).rejects.toThrow(/relación no se puede reseñar/);
    // Nadie se reseña a sí mismo.
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.guest, criteria: CRITERIA.flatmate_to_flatmate }),
    ).rejects.toThrow();
  });

  it("acepta las cuatro relaciones válidas y deduce la relación", async () => {
    const w = await createWorld(db);
    const cases = [
      { author: w.guest, subjectListing: w.listing, criteria: CRITERIA.tenant_to_listing, rel: "tenant_to_listing" },
      { author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord, rel: "tenant_to_landlord" },
      { author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant, rel: "landlord_to_tenant" },
      { author: w.flatmate, subjectUser: w.guest, criteria: CRITERIA.flatmate_to_flatmate, rel: "flatmate_to_flatmate" },
      { author: w.guest, subjectUser: w.flatmate, criteria: CRITERIA.flatmate_to_flatmate, rel: "flatmate_to_flatmate" },
    ];
    for (const c of cases) {
      const review = await writeReview(db, { stay: w.stay, ...c });
      expect(review.relationship).toBe(c.rel);
    }
  });

  it("rechaza criterios que no corresponden a la relación", async () => {
    const w = await createWorld(db);
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.landlord_to_tenant }),
    ).rejects.toThrow(/Criterios no válidos/);
    await expect(
      writeReview(db, {
        stay: w.stay,
        author: w.guest,
        subjectUser: w.host,
        criteria: { ...CRITERIA.tenant_to_landlord, origen: 1 },
      }),
    ).rejects.toThrow(/Criterios no válidos/);
    await expect(
      writeReview(db, {
        stay: w.stay,
        author: w.guest,
        subjectUser: w.host,
        criteria: { ...CRITERIA.tenant_to_landlord, deposit: 6 },
      }),
    ).rejects.toThrow(/Criterios no válidos/);
  });

  it("rechaza textos fuera de 50-1500 caracteres", async () => {
    const w = await createWorld(db);
    await expect(
      writeReview(db, {
        stay: w.stay,
        author: w.guest,
        subjectUser: w.host,
        criteria: CRITERIA.tenant_to_landlord,
        body: "Muy bien.",
      }),
    ).rejects.toThrow(/reviews_content_or_deleted/);
  });

  it("rechaza reseñar antes de que se abra la ventana", async () => {
    const w = await createWorld(db, { windowNotOpenYet: true });
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/ventana/);
  });

  it("rechaza reseñar cuando la ventana (30 días) ya se cerró", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 31 });
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/ventana/);
  });

  it("rechaza reseñar a quien te ha bloqueado", async () => {
    const w = await createWorld(db);
    await as(db, w.host, (tx) =>
      tx.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [w.host, w.guest]),
    );
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/No puedes reseñar/);
  });

  it("rechaza duplicar la reseña de la misma estancia y sujeto", async () => {
    const w = await createWorld(db);
    await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await expect(
      writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord }),
    ).rejects.toThrow(/reviews_unique_user/);
  });

  it("ignora published_at y relationship enviados por el cliente", async () => {
    const w = await createWorld(db);
    await expect(
      as(db, w.guest, (tx) =>
        tx.query(
          `insert into public.reviews (stay_id, author_id, subject_type, subject_user_id, rating, criteria, body, published_at)
           values ($1, $2, 'user', $3, 5, $4, $5, now() - interval '1 year')`,
          [w.stay, w.guest, w.host, JSON.stringify(CRITERIA.tenant_to_landlord), BODY],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("regla b) doble ciego", () => {
  it("el autor ve la suya; ni el reseñado ni terceros ni anónimos la ven antes de tiempo", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    const review = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectUser: w.host,
      criteria: CRITERIA.tenant_to_landlord,
    });

    expect(await visibleReviewIds(db, w.guest, w.stay)).toEqual([review.id]);
    expect(await visibleReviewIds(db, w.host, w.stay)).toEqual([]);
    expect(await visibleReviewIds(db, w.stranger, w.stay)).toEqual([]);
    expect(await visibleReviewIds(db, null, w.stay)).toEqual([]);

    // Se publicará a los 14 días de abrirse la ventana. La ventana abrió a
    // medianoche (hora de Madrid) de hace 3 días -> quedan entre ~10 y 11 días.
    const days = (review.published_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(9.8);
    expect(days).toBeLessThanOrEqual(11);
  });

  it("cuando la contraparte reseña, se publican las dos (y la del inmueble)", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    const onListing = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectListing: w.listing,
      criteria: CRITERIA.tenant_to_listing,
    });
    const onHost = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectUser: w.host,
      criteria: CRITERIA.tenant_to_landlord,
    });
    expect(await visibleReviewIds(db, null, w.stay)).toEqual([]);

    const onGuest = await writeReview(db, {
      stay: w.stay,
      author: w.host,
      subjectUser: w.guest,
      criteria: CRITERIA.landlord_to_tenant,
    });

    const visible = await visibleReviewIds(db, null, w.stay);
    expect(visible.sort()).toEqual([onListing.id, onHost.id, onGuest.id].sort());
    expect((await visibleReviewIds(db, w.stranger, w.stay)).length).toBe(3);
  });

  it("la reseña de un compañero no publica las del par host/guest", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    const guestOnHost = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectUser: w.host,
      criteria: CRITERIA.tenant_to_landlord,
    });
    const flatmateOnGuest = await writeReview(db, {
      stay: w.stay,
      author: w.flatmate,
      subjectUser: w.guest,
      criteria: CRITERIA.flatmate_to_flatmate,
    });
    expect(await visibleReviewIds(db, null, w.stay)).toEqual([]);

    // El guest responde al compañero: se publica ese par, no la del host.
    const guestOnFlatmate = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectUser: w.flatmate,
      criteria: CRITERIA.flatmate_to_flatmate,
    });
    const visible = await visibleReviewIds(db, null, w.stay);
    expect(visible.sort()).toEqual([flatmateOnGuest.id, guestOnFlatmate.id].sort());
    expect(visible).not.toContain(guestOnHost.id);
  });

  it("antes de los 14 días no se publica; pasados 14 días se publica sola", async () => {
    const at12 = await createWorld(db, { windowOpenedDaysAgo: 12 });
    await writeReview(db, { stay: at12.stay, author: at12.guest, subjectUser: at12.host, criteria: CRITERIA.tenant_to_landlord });
    expect(await visibleReviewIds(db, null, at12.stay)).toEqual([]);

    const at15 = await createWorld(db, { windowOpenedDaysAgo: 15 });
    const late = await writeReview(db, {
      stay: at15.stay,
      author: at15.guest,
      subjectUser: at15.host,
      criteria: CRITERIA.tenant_to_landlord,
    });
    expect(await visibleReviewIds(db, null, at15.stay)).toEqual([late.id]);
    expect(await visibleReviewIds(db, at15.host, at15.stay)).toEqual([late.id]);
  });

  it("las estadísticas solo cuentan reseñas publicadas", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord, rating: 2 });

    const statsBefore = await as(db, w.guest, (tx) =>
      tx.query("select * from public.profile_review_stats($1)", [w.host]),
    );
    expect(statsBefore.rows).toEqual([]);

    await writeReview(db, { stay: w.stay, author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant, rating: 4 });
    const stats = await as(db, null, (tx) =>
      tx.query<{ relationship: string; review_count: number; avg_rating: string; criteria_avg: Record<string, number> }>(
        "select * from public.profile_review_stats($1)",
        [w.host],
      ),
    );
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].relationship).toBe("tenant_to_landlord");
    expect(Number(stats.rows[0].review_count)).toBe(1);
    expect(Number(stats.rows[0].avg_rating)).toBe(2);
    expect(Object.keys(stats.rows[0].criteria_avg).sort()).toEqual(
      ["communication", "compliance", "deposit", "treatment"],
    );
  });
});

describe("regla c) inmutables; solo se borran con motivo", () => {
  async function publishedPair() {
    const w = await createWorld(db, { windowOpenedDaysAgo: 20 });
    const review = await writeReview(db, {
      stay: w.stay,
      author: w.guest,
      subjectUser: w.host,
      criteria: CRITERIA.tenant_to_landlord,
    });
    return { w, review };
  }

  it("el autor no puede editar su reseña", async () => {
    const { w, review } = await publishedPair();
    await expect(
      as(db, w.guest, (tx) => tx.query("update public.reviews set rating = 1 where id = $1", [review.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("ni siquiera un rol privilegiado puede editar el contenido", async () => {
    const { review } = await publishedPair();
    await expect(
      db.query("update public.reviews set body = $2 where id = $1", [review.id, BODY + " editado"]),
    ).rejects.toThrow(/no se pueden editar/);
    await expect(
      db.query("update public.reviews set published_at = now() + interval '1 day' where id = $1", [review.id]),
    ).rejects.toThrow(/retrasar/);
  });

  it("no se pueden borrar físicamente", async () => {
    const { w, review } = await publishedPair();
    await expect(
      as(db, w.guest, (tx) => tx.query("delete from public.reviews where id = $1", [review.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.reviews where id = $1", [review.id])).rejects.toThrow(
      /delete_review/,
    );
  });

  it("delete_review deja constancia (fecha y motivo) pero no el contenido", async () => {
    const { w, review } = await publishedPair();

    await expect(
      as(db, w.stranger, (tx) => tx.query("select public.delete_review($1, $2)", [review.id, "No me gusta nada"])),
    ).rejects.toThrow(/no encontrada/);
    await expect(
      as(db, w.guest, (tx) => tx.query("select public.delete_review($1, $2)", [review.id, "corto"])),
    ).rejects.toThrow(/motivo/);

    await as(db, w.guest, (tx) =>
      tx.query("select public.delete_review($1, $2)", [review.id, "Me equivoqué de persona al escribirla"]),
    );

    const { rows } = await as(db, null, (tx) =>
      tx.query<{ body: string | null; rating: number | null; criteria: unknown; deleted_at: Date | null; deletion_reason: string }>(
        "select body, rating, criteria, deleted_at, deletion_reason from public.reviews where id = $1",
        [review.id],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: null, rating: null, criteria: null });
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deletion_reason).toBe("Me equivoqué de persona al escribirla");

    await expect(
      as(db, w.guest, (tx) => tx.query("select public.delete_review($1, $2)", [review.id, "Segundo intento de borrado"])),
    ).rejects.toThrow(/no encontrada/);
  });

  it("un admin puede eliminar una reseña ajena", async () => {
    const { review } = await publishedPair();
    const admin = (await sysInsert<{ id: string }>(
      db,
      `insert into auth.users (id, email, created_at) values (gen_random_uuid(), 'admin@example.com', now()) returning id`,
    )).id;
    await db.query("insert into public.admin_users (user_id) values ($1)", [admin]);
    await as(db, admin, (tx) =>
      tx.query("select public.delete_review($1, $2)", [review.id, "Contiene datos personales de terceros"]),
    );
    const { rows } = await db.query<{ deleted_by: string }>("select deleted_by from public.reviews where id = $1", [
      review.id,
    ]);
    expect(rows[0].deleted_by).toBe(admin);
  });
});
