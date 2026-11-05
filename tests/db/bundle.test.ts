import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

import { buildBundle } from "../../scripts/bundle-sql.mjs";

const ROOT = join(__dirname, "..", "..");

describe("supabase/instalar-base-de-datos.sql", () => {
  it("está al día con las migraciones (si falla: npm run db:bundle)", () => {
    const onDisk = readFileSync(join(ROOT, "supabase", "instalar-base-de-datos.sql"), "utf8");
    expect(onDisk).toBe(buildBundle());
  });

  it("se aplica de una vez sobre un Postgres limpio, junto con el seed", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
    await db.exec(readFileSync(join(ROOT, "supabase", "instalar-base-de-datos.sql"), "utf8"));
    await db.exec(readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8"));
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.listings");
    expect(rows[0].n).toBeGreaterThan(5);
  });
});
