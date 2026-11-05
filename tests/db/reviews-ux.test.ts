import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, type Db } from "./helpers";
import { CRITERIA, createWorld, visibleReviewIds, writeReview } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

/** Reseña publicada (el host y el guest se reseñan mutuamente). */
async function publishedReview() {
  const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
  const onHost = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
  const onListing = await writeReview(db, { stay: w.stay, author: w.guest, subjectListing: w.listing, criteria: CRITERIA.tenant_to_listing });
  await writeReview(db, { stay: w.stay, author: w.host, subjectUser: w.guest, criteria: CRITERIA.landlord_to_tenant });
  return { w, onHost, onListing };
}

const respond = (user: string, reviewId: string, body = "Gracias por tu reseña, fue un placer convivir contigo.") =>
  as(db, user, (tx) =>
    tx.query("insert into public.review_responses (review_id, author_id, body) values ($1, $2, $3)", [reviewId, user, body]),
  );

const report = (user: string, reviewId: string, reason: string) =>
  as(db, user, (tx) =>
    tx.query("insert into public.reports (reporter_id, target_review_id, reason) values ($1, $2, $3::public.report_reason)", [
      user,
      reviewId,
      reason,
    ]),
  );

describe("respuesta pública del reseñado", () => {
  it("solo responde el reseñado (o el dueño del inmueble), una vez y sin editar", async () => {
    const { w, onHost, onListing } = await publishedReview();

    await expect(respond(w.stranger, onHost.id)).rejects.toThrow(/Solo la persona reseñada/);
    await expect(respond(w.guest, onHost.id)).rejects.toThrow(/Solo la persona reseñada/);
    await respond(w.host, onHost.id);
    await expect(respond(w.host, onHost.id)).rejects.toThrow(/review_responses_pkey/);
    await respond(w.host, onListing.id); // el propietario responde por su inmueble

    await expect(
      as(db, w.host, (tx) => tx.query("update public.review_responses set body = 'Editado editado' where review_id = $1", [onHost.id])),
    ).rejects.toThrow(/permission denied/);
    const visible = await as(db, null, (tx) => tx.query("select body from public.review_responses where review_id = $1", [onHost.id]));
    expect(visible.rows).toHaveLength(1);
  });

  it("no se puede responder a una reseña aún no publicada", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 3 });
    const pending = await writeReview(db, { stay: w.stay, author: w.guest, subjectUser: w.host, criteria: CRITERIA.tenant_to_landlord });
    await expect(respond(w.host, pending.id)).rejects.toThrow(/publicada/);
  });
});

describe("moderación", () => {
  it("una denuncia normal no oculta la reseña; una por datos personales sí (y sale de las medias)", async () => {
    const { w, onHost } = await publishedReview();
    const reporter = await createUser(db, "Denunciante");

    await report(reporter, onHost.id, "offensive");
    expect(await visibleReviewIds(db, null, w.stay)).toContain(onHost.id);

    const other = await createUser(db, "Otra");
    await report(other, onHost.id, "personal_data");
    expect(await visibleReviewIds(db, null, w.stay)).not.toContain(onHost.id);
    expect(await visibleReviewIds(db, w.guest, w.stay)).toContain(onHost.id); // el autor la sigue viendo

    const stats = await as(db, null, (tx) => tx.query("select * from public.profile_review_stats($1)", [w.host]));
    expect(stats.rows).toHaveLength(0);

    // El admin la revisa y descarta la denuncia: vuelve a verse.
    await db.query("update public.reports set status = 'dismissed', resolved_at = now() where target_review_id = $1", [onHost.id]);
    expect(await visibleReviewIds(db, null, w.stay)).toContain(onHost.id);
  });

  it("no se puede denunciar dos veces la misma reseña ni más de 10 veces al día", async () => {
    const { onHost } = await publishedReview();
    const reporter = await createUser(db, "Pesado");
    await report(reporter, onHost.id, "spam");
    await expect(report(reporter, onHost.id, "spam")).rejects.toThrow(/reports_one_open_per_review/);

    const others = await Promise.all(Array.from({ length: 10 }, () => publishedReview()));
    for (const o of others.slice(0, 9)) await report(reporter, o.onHost.id, "spam");
    await expect(report(reporter, others[9].onHost.id, "spam")).rejects.toThrow(/demasiadas denuncias/);
  });
});

describe("avisos de ventana y notificaciones", () => {
  it("review_window_notices_due solo lo puede llamar service_role e incluye a todos los miembros", async () => {
    const w = await createWorld(db, { windowOpenedDaysAgo: 28 });
    await expect(as(db, w.host, (tx) => tx.query("select * from public.review_window_notices_due()"))).rejects.toThrow(
      /permission denied/,
    );

    const due = await db.query<{ user_id: string; kind: string }>(
      "select user_id, kind from public.review_window_notices_due() where stay_id = $1",
      [w.stay],
    );
    const users = new Set(due.rows.map((r) => r.user_id));
    expect(users).toEqual(new Set([w.host, w.guest, w.flatmate])); // no el compañero sin confirmar
    expect(new Set(due.rows.map((r) => r.kind))).toEqual(new Set(["opened", "closing"]));

    // Una vez registrado el aviso, ya no vuelve a salir.
    await db.query(
      `insert into public.review_window_notices (stay_id, user_id, kind, opens_at)
       select stay_id, user_id, kind, opens_at from public.review_window_notices_due() where stay_id = $1`,
      [w.stay],
    );
    const again = await db.query("select 1 from public.review_window_notices_due() where stay_id = $1", [w.stay]);
    expect(again.rows).toHaveLength(0);
  });

  it("cada usuario ve y marca como leídas solo sus notificaciones", async () => {
    const a = await createUser(db, "Ana N");
    const b = await createUser(db, "Bea N");
    await db.query(
      "insert into public.notifications (user_id, kind, title, url) values ($1, 'review_window_opened', 'Ya puedes reseñar', '/mis-resenas')",
      [a],
    );
    const seenByB = await as(db, b, (tx) => tx.query("select id from public.notifications"));
    expect(seenByB.rows).toHaveLength(0);
    const res = await as(db, b, (tx) => tx.query("update public.notifications set read_at = now()"));
    expect(res.affectedRows).toBe(0);
    const mine = await as(db, a, (tx) => tx.query("update public.notifications set read_at = now()"));
    expect(mine.affectedRows).toBe(1);
  });
});

describe("señales anti-abuso", () => {
  it("se registran hashes y el admin ve las reseñas con IP compartida", async () => {
    const { w, onHost } = await publishedReview();
    const ip = "a".repeat(64);
    await as(db, w.guest, (tx) => tx.query("select public.record_signal($1, $2)", [ip, "b".repeat(64)]));
    await as(db, w.host, (tx) => tx.query("select public.record_signal($1, $2)", [ip, "c".repeat(64)]));

    await expect(as(db, w.guest, (tx) => tx.query("select * from public.user_signals"))).rejects.toThrow(/permission denied/);
    await expect(as(db, w.guest, (tx) => tx.query("select * from public.admin_review_flags()"))).rejects.toThrow(
      /Solo administradores/,
    );

    const admin = await createUser(db, "Admin");
    await db.query("insert into public.admin_users (user_id) values ($1)", [admin]);
    const flags = await as(db, admin, (tx) =>
      tx.query<{ review_id: string; shared_ip: boolean; shared_device: boolean }>("select * from public.admin_review_flags()"),
    );
    const flag = flags.rows.find((f) => f.review_id === onHost.id);
    expect(flag).toMatchObject({ shared_ip: true, shared_device: false });
  });
});
