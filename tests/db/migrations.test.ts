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
      "auth_attempts",
      "blocks",
      "contract_inventories",
      "contracts",
      "conversation_reads",
      "interests",
      "inventory_items",
      "legal_notices",
      "listing_addresses",
      "listing_flags",
      "listings",
      "messages",
      "moderation_log",
      "notifications",
      "profiles",
      "reports",
      "review_responses",
      "review_window_notices",
      "reviews",
      "stay_participants",
      "stays",
      "user_signals",
    ]);
    // RLS activada en TODAS las tablas públicas.
    expect(rows.every((r) => r.rowsecurity)).toBe(true);
  });
});
