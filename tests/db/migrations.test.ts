import { describe, expect, it } from "vitest";

import { createTestDb } from "./helpers";

describe("migraciones", () => {
  it("se aplican sobre un Postgres limpio", async () => {
    const db = await createTestDb();
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      "admin_users",
      "blocks",
      "interests",
      "listing_addresses",
      "listings",
      "messages",
      "profiles",
      "reports",
      "reviews",
      "stay_participants",
      "stays",
    ]);
    // RLS activada en TODAS las tablas públicas.
    expect(rows.every((r) => r.rowsecurity)).toBe(true);
  });
});
