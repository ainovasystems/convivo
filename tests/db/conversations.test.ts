import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, type Db } from "./helpers";
import { createActiveListing } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const MSG = "Hola, me interesa mucho la habitación. ¿Cuándo podría verla?";

async function setup() {
  const host = await createUser(db, "Host");
  const guest = await createUser(db, "Guest");
  const listing = await createActiveListing(db, host);
  const interest = await as(db, guest, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id",
      [listing.id, guest, MSG],
    );
    return rows[0].id;
  });
  return { host, guest, listing: listing.id, interest };
}
type World = Awaited<ReturnType<typeof setup>>;

const send = (user: string, interest: string, body: string) =>
  as(db, user, (tx) =>
    tx.query("insert into public.messages (interest_id, sender_id, body) values ($1, $2, $3)", [interest, user, body]),
  );

const accept = (w: World) =>
  as(db, w.host, (tx) => tx.query("update public.interests set status = 'accepted' where id = $1", [w.interest]));

/** Propone una estancia; `startOffsetDays` relativo a hoy. */
async function propose(by: string, w: World, startOffsetDays = 7) {
  return as(db, by, async (tx) => {
    const { rows } = await tx.query<{ id: string; status: string }>(
      `insert into public.stays (listing_id, interest_id, host_id, guest_id, start_date)
       values ($1, $2, $3, $4, current_date + $5::int) returning id, status`,
      [w.listing, w.interest, w.host, w.guest, startOffsetDays],
    );
    return rows[0];
  });
}

const RPCS = {
  confirm_stay: "select * from public.confirm_stay($1)",
  cancel_stay: "select * from public.cancel_stay($1)",
  end_stay: "select * from public.end_stay($1)",
  end_stay_on: "select * from public.end_stay($1, $2::date)",
  add_stay_participant: "select * from public.add_stay_participant($1, $2)",
  confirm_stay_participation: "select * from public.confirm_stay_participation($1)",
  decline_stay_participation: "select public.decline_stay_participation($1)",
} as const;

const rpc = (user: string, fn: keyof typeof RPCS, ...args: unknown[]) =>
  as(db, user, async (tx) => {
    const { rows } = await tx.query<{ status?: string; user_id?: string }>(RPCS[fn], args);
    return rows[0];
  });

describe("máquina de estados de stay", () => {
  it("no se puede proponer sin interés aceptado", async () => {
    const w = await setup();
    await expect(propose(w.guest, w)).rejects.toThrow(/interés aceptado/);
  });

  it("proposed → active solo cuando confirman ambas partes", async () => {
    const w = await setup();
    await accept(w);
    const stay = await propose(w.guest, w);
    expect(stay.status).toBe("proposed");
    // Quien propone ya está confirmado: volver a confirmar no la activa.
    expect((await rpc(w.guest, "confirm_stay", stay.id)).status).toBe("proposed");
    expect((await rpc(w.host, "confirm_stay", stay.id)).status).toBe("active");
  });

  it("transiciones inválidas desde active, y active → ended", async () => {
    const w = await setup();
    await accept(w);
    const stay = await propose(w.host, w, -40);
    await rpc(w.guest, "confirm_stay", stay.id);

    await expect(rpc(w.guest, "confirm_stay", stay.id)).rejects.toThrow(/ya no admite/);
    await expect(rpc(w.guest, "cancel_stay", stay.id)).rejects.toThrow(/pendiente de confirmar/);
    await expect(rpc(w.guest, "end_stay_on", stay.id, "2000-01-01")).rejects.toThrow(/Fecha de fin no válida/);

    expect((await rpc(w.guest, "end_stay", stay.id)).status).toBe("ended");
    await expect(rpc(w.host, "end_stay", stay.id)).rejects.toThrow(/Solo se puede terminar una estancia activa/);
  });

  it("proposed → cancelled por cualquiera; después no se confirma, pero se puede volver a proponer", async () => {
    const w = await setup();
    await accept(w);
    const stay = await propose(w.guest, w);
    expect((await rpc(w.host, "cancel_stay", stay.id)).status).toBe("cancelled");
    await expect(rpc(w.host, "confirm_stay", stay.id)).rejects.toThrow(/ya no admite/);
    expect((await propose(w.guest, w)).status).toBe("proposed");
  });

  it("no puede haber dos estancias vivas para el mismo anuncio e inquilino", async () => {
    const w = await setup();
    await accept(w);
    await propose(w.guest, w);
    await expect(propose(w.host, w)).rejects.toThrow(/stays_one_open_per_guest/);
  });

  it("compañeros: los añade host o guest y confirman ellos mismos", async () => {
    const w = await setup();
    const mate = await createUser(db, "Mate");
    const stranger = await createUser(db, "Stranger");
    await accept(w);
    const stay = await propose(w.guest, w);

    await expect(rpc(stranger, "add_stay_participant", stay.id, mate)).rejects.toThrow(/no encontrada/);
    await rpc(w.host, "add_stay_participant", stay.id, mate);
    await expect(rpc(w.host, "add_stay_participant", stay.id, w.guest)).rejects.toThrow(/ya forma parte/);
    await expect(rpc(stranger, "confirm_stay_participation", stay.id)).rejects.toThrow(/No figuras/);
    expect(await rpc(mate, "confirm_stay_participation", stay.id)).toMatchObject({ user_id: mate });
    await expect(rpc(mate, "decline_stay_participation", stay.id)).rejects.toThrow(/pendiente/);
  });
});

describe("no leídos", () => {
  it("cuenta solo mensajes ajenos posteriores a la última lectura", async () => {
    const w = await setup();
    const unread = (user: string) =>
      as(db, user, (tx) =>
        tx.query<{ interest_id: string; unread: string }>("select * from public.my_unread_counts()"),
      ).then((r) => Number(r.rows.find((x) => x.interest_id === w.interest)?.unread ?? 0));

    await send(w.guest, w.interest, "Primer mensaje");
    await send(w.guest, w.interest, "Segundo mensaje");
    expect(await unread(w.host)).toBe(2);
    expect(await unread(w.guest)).toBe(0);

    await as(db, w.host, (tx) => tx.query("select public.mark_conversation_read($1)", [w.interest]));
    expect(await unread(w.host)).toBe(0);

    const stranger = await createUser(db, "Curioso");
    await expect(
      as(db, stranger, (tx) => tx.query("select public.mark_conversation_read($1)", [w.interest])),
    ).rejects.toThrow(/no encontrada/);
  });
});

describe("límites de frecuencia", () => {
  it("bloquea el mensaje número 61 en una hora", async () => {
    const w = await setup();
    await db.query(
      `insert into public.messages (interest_id, sender_id, body)
       select $1, $2, 'mensaje ' || g from generate_series(1, 60) g`,
      [w.interest, w.guest],
    );
    await expect(send(w.guest, w.interest, "uno más")).rejects.toThrow(/demasiados mensajes/);
    await send(w.host, w.interest, "Respuesta normal");
  });

  it("bloquea el interés número 16 en una hora", async () => {
    const spammer = await createUser(db, "Spammer");
    const owner = await createUser(db, "Dueña");
    const ids: string[] = [];
    for (let i = 0; i < 16; i++) ids.push((await createActiveListing(db, owner)).id);
    const express = (listing: string) =>
      as(db, spammer, (tx) =>
        tx.query("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3)", [
          listing,
          spammer,
          MSG,
        ]),
      );
    for (const id of ids.slice(0, 15)) await express(id);
    await expect(express(ids[15])).rejects.toThrow(/demasiados anuncios/);
  });
});
