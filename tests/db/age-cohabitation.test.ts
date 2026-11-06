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

const year = new Date().getFullYear();

describe("edad del perfil", () => {
  it("se guarda el año de nacimiento y exige 18 años o más", async () => {
    const u = await createUser(db, "Lucía Edad");
    const setYear = (y: number) => as(db, u, (tx) => tx.query("update public.profiles set birth_year = $2 where id = $1", [u, y]));
    await setYear(year - 21);
    await expect(setYear(year - 17)).rejects.toThrow(/18 años o más/);
    await expect(setYear(year - 120)).rejects.toThrow(/Revisa el año/);
    const { rows } = await db.query<{ birth_year: number }>("select birth_year from public.profiles where id = $1", [u]);
    expect(rows[0].birth_year).toBe(year - 21);
  });

  it("al borrar la cuenta se borra también el año", async () => {
    const u = await createUser(db, "Borra Edad");
    await as(db, u, (tx) => tx.query("update public.profiles set birth_year = $2 where id = $1", [u, year - 30]));
    await as(db, u, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    const { rows } = await db.query<{ birth_year: number | null }>("select birth_year from public.profiles where id = $1", [u]);
    expect(rows[0].birth_year).toBeNull();
  });
});

describe("preferencia de convivencia", () => {
  it("«solo chicas» o «solo chicos» en habitaciones; un piso entero siempre es indiferente", async () => {
    const owner = await createUser(db, "Casera Convivencia");
    const room = (await createActiveListing(db, owner, "room")).id;
    const flat = (await createActiveListing(db, owner, "flat")).id;
    const set = (id: string, v: string) =>
      as(db, owner, (tx) => tx.query("update public.listings set cohabitation = $2::public.cohabitation_preference where id = $1", [id, v]));
    await set(room, "women");
    await expect(set(flat, "women")).rejects.toThrow(/listings_cohabitation_shared/);
    const { rows } = await db.query<{ cohabitation: string }>("select cohabitation from public.listings where id = $1", [flat]);
    expect(rows[0].cohabitation).toBe("any");
  });
});
