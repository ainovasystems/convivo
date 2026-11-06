import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActiveListing } from "./fixtures";
import { as, createTestDb, createUser, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("periodo de alquiler", () => {
  it("por defecto es indefinido y no admite fecha de fin", async () => {
    const owner = await createUser(db, "Paula Periodo");
    const listing = await createActiveListing(db, owner);
    const { rows } = await db.query<{ rental_term: string }>("select rental_term from public.listings where id = $1", [listing.id]);
    expect(rows[0].rental_term).toBe("indefinite");
    await expect(
      as(db, owner, (tx) => tx.query("update public.listings set available_until = current_date + 300 where id = $1", [listing.id])),
    ).rejects.toThrow(/listings_until_only_with_term/);
  });

  it("curso o fechas concretas exigen fecha de fin posterior a la entrada para publicar", async () => {
    const owner = await createUser(db, "Paula Curso");
    const listing = await createActiveListing(db, owner);
    const update = (sql: string) => as(db, owner, (tx) => tx.query(sql, [listing.id]));

    await expect(update("update public.listings set rental_term = 'academic_year' where id = $1")).rejects.toThrow(
      /listings_until_required/,
    );
    await expect(
      update("update public.listings set rental_term = 'fixed', available_until = available_from - 1 where id = $1"),
    ).rejects.toThrow(/listings_until_after_start/);
    await update("update public.listings set rental_term = 'academic_year', available_until = available_from + 300 where id = $1");

    // En borrador se puede dejar a medias.
    await update("update public.listings set status = 'paused' where id = $1");
    const draft = await as(db, owner, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "insert into public.listings (owner_id, kind, title, rental_term) values ($1, 'room', 'Borrador', 'fixed') returning id",
        [owner],
      );
      return rows[0];
    });
    expect(draft.id).toBeTruthy();
  });
});
