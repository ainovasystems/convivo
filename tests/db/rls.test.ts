import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, sysInsert, type Db } from "./helpers";
import { createActiveListing } from "./fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const INTEREST_MSG = "Hola, me encaja mucho la habitación. ¿Podría verla esta semana?";

async function expressInterest(userId: string, listingId: string) {
  return as(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; status: string }>(
      "insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id, status",
      [listingId, userId, INTEREST_MSG],
    );
    return rows[0];
  });
}

async function setInterestStatus(userId: string, interestId: string, status: string) {
  return as(db, userId, (tx) =>
    tx.query("update public.interests set status = $2::public.interest_status where id = $1", [interestId, status]),
  );
}

describe("profiles", () => {
  it("se crea al registrarse y es de lectura pública", async () => {
    const u = await createUser(db, "Lucía");
    const { rows } = await as(db, null, (tx) =>
      tx.query<{ display_name: string; email_verified: boolean }>(
        "select display_name, email_verified from public.profiles where id = $1",
        [u],
      ),
    );
    expect(rows[0]).toEqual({ display_name: "Lucía", email_verified: true });
  });

  it("cada uno edita solo su perfil y solo las columnas editables", async () => {
    const me = await createUser(db, "Mario");
    const other = await createUser(db, "Nora");

    await as(db, me, (tx) => tx.query("update public.profiles set bio = 'Hola' where id = $1", [me]));
    const res = await as(db, me, (tx) => tx.query("update public.profiles set bio = 'Pirateado' where id = $1", [other]));
    expect(res.affectedRows).toBe(0);

    await expect(
      as(db, me, (tx) => tx.query("update public.profiles set email_verified = true where id = $1", [me])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, me, (tx) => tx.query("update public.profiles set phone_verified = true where id = $1", [me])),
    ).rejects.toThrow(/permission denied/);
  });

  it("los hábitos solo admiten claves de la lista cerrada", async () => {
    const me = await createUser(db, "Olga");
    await as(db, me, (tx) =>
      tx.query(`update public.profiles set habits = '{"smoker": false, "cleanliness": 4, "schedule": "night"}' where id = $1`, [me]),
    );
    await expect(
      as(db, me, (tx) => tx.query(`update public.profiles set habits = '{"religion": "x"}' where id = $1`, [me])),
    ).rejects.toThrow(/profiles_habits_valid/);
    await expect(
      as(db, me, (tx) => tx.query(`update public.profiles set habits = '{"cleanliness": 9}' where id = $1`, [me])),
    ).rejects.toThrow(/profiles_habits_valid/);
  });
});

describe("listings", () => {
  it("anónimos solo ven anuncios activos; el dueño ve sus borradores", async () => {
    const owner = await createUser(db, "Pablo");
    const active = await createActiveListing(db, owner);
    const draft = await as(db, owner, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "insert into public.listings (owner_id, kind) values ($1, 'flat') returning id",
        [owner],
      );
      return rows[0];
    });

    const anon = await as(db, null, (tx) =>
      tx.query<{ id: string }>("select id from public.listings where owner_id = $1", [owner]),
    );
    expect(anon.rows.map((r) => r.id)).toEqual([active.id]);

    const mine = await as(db, owner, (tx) =>
      tx.query<{ id: string }>("select id from public.listings where owner_id = $1", [owner]),
    );
    expect(mine.rows.map((r) => r.id).sort()).toEqual([active.id, draft.id].sort());
  });

  it("no se puede publicar un anuncio incompleto ni mezclar campos de otro tipo", async () => {
    const owner = await createUser(db, "Quique");
    await expect(
      as(db, owner, (tx) =>
        tx.query("insert into public.listings (owner_id, kind, status, title) values ($1, 'room', 'active', 'Corto')", [owner]),
      ),
    ).rejects.toThrow(/listings_required_when_published/);
    await expect(
      as(db, owner, (tx) =>
        tx.query("insert into public.listings (owner_id, kind, monthly_rent) values ($1, 'seeking', 300)", [owner]),
      ),
    ).rejects.toThrow(/listings_kind_exclusive_fields/);
    // Un "busco" completo sí se publica.
    await as(db, owner, (tx) =>
      tx.query(
        `insert into public.listings (owner_id, kind, status, title, description, city, province, max_budget, zones, move_in_date)
         values ($1, 'seeking', 'active', 'Busco habitación en Lugo', 'Estudiante de máster, tranquila y ordenada, busco habitación.',
                 'Lugo', 'Lugo', 350, '{Centro,Milagrosa}', current_date + 30)`,
        [owner],
      ),
    );
  });

  it("nadie crea anuncios a nombre de otro ni toca los ajenos", async () => {
    const a = await createUser(db, "Rosa");
    const b = await createUser(db, "Sergio");
    const listing = await createActiveListing(db, b);
    await expect(
      as(db, a, (tx) => tx.query("insert into public.listings (owner_id, kind) values ($1, 'room')", [b])),
    ).rejects.toThrow(/row-level security/);
    const res = await as(db, a, (tx) =>
      tx.query("update public.listings set title = 'Hackeado hackeado' where id = $1", [listing.id]),
    );
    expect(res.affectedRows).toBe(0);
  });
});

describe("dirección exacta", () => {
  it("solo la ven el dueño y los interesados aceptados", async () => {
    const owner = await createUser(db, "Teresa");
    const accepted = await createUser(db, "Ulises");
    const pending = await createUser(db, "Vera");
    const stranger = await createUser(db, "Walter");
    const listing = await createActiveListing(db, owner);

    await as(db, owner, (tx) =>
      tx.query(
        "insert into public.listing_addresses (listing_id, address_line, postal_code) values ($1, 'Rúa da Raíña 12, 3º B', '27001')",
        [listing.id],
      ),
    );
    const i1 = await expressInterest(accepted, listing.id);
    await expressInterest(pending, listing.id);
    await setInterestStatus(owner, i1.id, "accepted");

    const read = (u: string | null) =>
      as(db, u, (tx) =>
        tx.query("select address_line from public.listing_addresses where listing_id = $1", [listing.id]),
      ).then((r) => r.rows.length);

    expect(await read(owner)).toBe(1);
    expect(await read(accepted)).toBe(1);
    expect(await read(pending)).toBe(0);
    expect(await read(stranger)).toBe(0);
    // Los anónimos ni siquiera tienen privilegio sobre la tabla.
    await expect(read(null)).rejects.toThrow(/permission denied/);

    // Y deja de verla si retira su interés.
    await setInterestStatus(accepted, i1.id, "withdrawn");
    expect(await read(accepted)).toBe(0);
  });
});

describe("interests (máquina de estados)", () => {
  it("no en tu propio anuncio, ni duplicado, ni con bloqueo", async () => {
    const owner = await createUser(db, "Ximena");
    const u = await createUser(db, "Yago");
    const blocked = await createUser(db, "Zoe");
    const listing = await createActiveListing(db, owner);

    await expect(expressInterest(owner, listing.id)).rejects.toThrow(/propio anuncio/);
    await expressInterest(u, listing.id);
    await expect(expressInterest(u, listing.id)).rejects.toThrow(/interests_unique_per_user/);

    await as(db, owner, (tx) =>
      tx.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [owner, blocked]),
    );
    await expect(expressInterest(blocked, listing.id)).rejects.toThrow(/No es posible contactar/);
  });

  it("solo el dueño acepta; solo el interesado retira; transiciones inválidas fallan", async () => {
    const owner = await createUser(db, "Alba");
    const u = await createUser(db, "Bea");
    const listing = await createActiveListing(db, owner);
    const interest = await expressInterest(u, listing.id);

    await expect(setInterestStatus(u, interest.id, "accepted")).rejects.toThrow(/Solo el anunciante/);
    await expect(setInterestStatus(owner, interest.id, "withdrawn")).rejects.toThrow(/Solo quien mostró interés/);
    await setInterestStatus(owner, interest.id, "declined");
    await expect(setInterestStatus(owner, interest.id, "accepted")).rejects.toThrow(/Transición de estado no permitida/);

    await expect(
      as(db, u, (tx) => tx.query("update public.interests set message = $2 where id = $1", [interest.id, INTEREST_MSG + "!"])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("messages", () => {
  it("solo las dos partes leen y escriben; conversación cerrada no admite mensajes", async () => {
    const owner = await createUser(db, "Carmen");
    const u = await createUser(db, "Diego");
    const stranger = await createUser(db, "Elena");
    const listing = await createActiveListing(db, owner);
    const interest = await expressInterest(u, listing.id);

    const send = (sender: string, body: string) =>
      as(db, sender, (tx) =>
        tx.query("insert into public.messages (interest_id, sender_id, body) values ($1, $2, $3)", [
          interest.id,
          sender,
          body,
        ]),
      );

    await send(u, "¿Sigue disponible?");
    await send(owner, "Sí, ¿cuándo te viene bien?");
    await expect(send(stranger, "Hola")).rejects.toThrow(/row-level security|No formas parte/);

    const count = (viewer: string) =>
      as(db, viewer, (tx) =>
        tx.query("select id from public.messages where interest_id = $1", [interest.id]),
      ).then((r) => r.rows.length);
    expect(await count(owner)).toBe(2);
    expect(await count(u)).toBe(2);
    expect(await count(stranger)).toBe(0);

    await setInterestStatus(owner, interest.id, "declined");
    await expect(send(u, "¿Por qué?")).rejects.toThrow(/cerrada/);
  });
});

describe("stays (confirmación por ambas partes)", () => {
  it("flujo completo: propuesta, confirmación y activación", async () => {
    const host = await createUser(db, "Fermín");
    const guest = await createUser(db, "Gloria");
    const listing = await createActiveListing(db, host);
    const interest = await expressInterest(guest, listing.id);
    await setInterestStatus(host, interest.id, "accepted");

    const stay = await as(db, guest, async (tx) => {
      const { rows } = await tx.query<{ id: string; status: string; is_retroactive: boolean }>(
        `insert into public.stays (listing_id, interest_id, host_id, guest_id, start_date)
         values ($1, $2, $3, $4, current_date + 7) returning id, status, is_retroactive`,
        [listing.id, interest.id, host, guest],
      );
      return rows[0];
    });
    expect(stay).toMatchObject({ status: "proposed", is_retroactive: false });

    // Nadie puede marcar la confirmación ajena a mano.
    await expect(
      as(db, guest, (tx) => tx.query("update public.stays set host_confirmed_at = now() where id = $1", [stay.id])),
    ).rejects.toThrow(/permission denied/);

    const confirmed = await as(db, host, (tx) =>
      tx.query<{ status: string }>("select status from public.confirm_stay($1)", [stay.id]),
    );
    expect(confirmed.rows[0].status).toBe("active");
  });

  it("sin interés aceptado solo se admiten estancias retroactivas (ya empezadas)", async () => {
    const host = await createUser(db, "Héctor");
    const guest = await createUser(db, "Inés");
    const listing = await createActiveListing(db, host);
    const propose = (start: string) =>
      as(db, host, (tx) =>
        tx.query<{ is_retroactive: boolean }>(
          `insert into public.stays (listing_id, host_id, guest_id, start_date)
           values ($1, $2, $3, ${start}) returning is_retroactive`,
          [listing.id, host, guest],
        ),
      );
    await expect(propose("current_date + 10")).rejects.toThrow(/retroactiva/);
    const res = await propose("current_date - 365");
    expect(res.rows[0].is_retroactive).toBe(true);
  });

  it("un extraño no puede confirmar ni ver la estancia, y el host debe ser el dueño", async () => {
    const host = await createUser(db, "Julia");
    const guest = await createUser(db, "Kevin");
    const stranger = await createUser(db, "Laura");
    const listing = await createActiveListing(db, host);

    await expect(
      as(db, stranger, (tx) =>
        tx.query(
          "insert into public.stays (listing_id, host_id, guest_id, start_date) values ($1, $2, $3, current_date - 10)",
          [listing.id, stranger, guest],
        ),
      ),
    ).rejects.toThrow(/propietario del anuncio/);

    const stay = await sysInsert<{ id: string }>(
      db,
      `insert into public.stays (listing_id, host_id, guest_id, start_date, guest_confirmed_at)
       values ($1, $2, $3, current_date - 10, now()) returning id`,
      [listing.id, host, guest],
    );
    await expect(
      as(db, stranger, (tx) => tx.query("select public.confirm_stay($1)", [stay.id])),
    ).rejects.toThrow(/no encontrada/);
    const seen = await as(db, stranger, (tx) => tx.query("select id from public.stays where id = $1", [stay.id]));
    expect(seen.rows).toHaveLength(0);
  });
});

describe("reports", () => {
  it("cualquiera denuncia; solo ve las suyas; solo un admin resuelve", async () => {
    const reporter = await createUser(db, "Manuel");
    const other = await createUser(db, "Nerea");
    const listing = await createActiveListing(db, other);

    await as(db, reporter, (tx) =>
      tx.query("insert into public.reports (reporter_id, target_listing_id, reason) values ($1, $2, 'fraud')", [
        reporter,
        listing.id,
      ]),
    );
    const mine = await as(db, reporter, (tx) => tx.query("select id from public.reports where reporter_id = $1", [reporter]));
    expect(mine.rows).toHaveLength(1);
    const theirs = await as(db, other, (tx) => tx.query("select id from public.reports"));
    expect(theirs.rows).toHaveLength(0);

    const res = await as(db, reporter, (tx) =>
      tx.query("update public.reports set status = 'dismissed', resolved_at = now(), resolved_by = $1", [reporter]),
    );
    expect(res.affectedRows).toBe(0);
  });
});

describe("storage listing-photos", () => {
  it("solo se sube a la carpeta propia", async () => {
    const u = await createUser(db, "Óscar");
    const other = await createUser(db, "Paula");
    const upload = (path: string) =>
      as(db, u, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name, owner) values ('listing-photos', $1, $2)", [path, u]),
      );
    await upload(`${u}/anuncio/foto-1.webp`);
    await expect(upload(`${other}/anuncio/foto-1.webp`)).rejects.toThrow(/row-level security/);
    await expect(upload(`foto-suelta.webp`)).rejects.toThrow(/row-level security/);
  });
});

describe("avatares", () => {
  it("avatar_path solo puede apuntar a la carpeta propia", async () => {
    const u = await createUser(db, "Quim");
    const other = await createUser(db, "Raquel");
    await as(db, u, (tx) => tx.query("update public.profiles set avatar_path = $2 where id = $1", [u, `${u}/avatar-1.webp`]));
    await expect(
      as(db, u, (tx) => tx.query("update public.profiles set avatar_path = $2 where id = $1", [u, `${other}/avatar.webp`])),
    ).rejects.toThrow(/profiles_avatar_path_own_folder/);
    await expect(
      as(db, u, (tx) =>
        tx.query("update public.profiles set avatar_path = $2 where id = $1", [u, "https://tracker.example/pixel.gif"]),
      ),
    ).rejects.toThrow(/profiles_avatar_path_own_folder/);
  });

  it("solo se sube a la carpeta propia del bucket avatars", async () => {
    const u = await createUser(db, "Sara");
    const other = await createUser(db, "Tomás");
    const upload = (path: string) =>
      as(db, u, (tx) => tx.query("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)", [path, u]));
    await upload(`${u}/avatar.webp`);
    await expect(upload(`${other}/avatar.webp`)).rejects.toThrow(/row-level security/);
  });
});
