import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, type Db } from "./helpers";

const ELENA_STAY = "d0000000-0000-4000-8000-000000000002";
const ANA = "a0000000-0000-4000-8000-000000000001";
const ELENA = "a0000000-0000-4000-8000-000000000005";
const DIEGO = "a0000000-0000-4000-8000-000000000004";

let db: Db;
beforeAll(async () => {
  db = await createTestDb({ seed: true });
});

describe("seed.sql", () => {
  it("carga usuarios, perfiles y anuncios activos de las cuatro ciudades", async () => {
    const { rows } = await as(db, null, (tx) =>
      tx.query<{ city: string }>("select distinct city from public.listings order by city"),
    );
    expect(rows.map((r) => r.city)).toEqual(["A Coruña", "Barcelona", "Lugo", "Madrid"]);
    const profiles = await db.query("select id from public.profiles");
    expect(profiles.rows).toHaveLength(8);
  });

  it("la estancia de Lugo tiene sus reseñas publicadas y estadísticas", async () => {
    const stats = await as(db, null, (tx) =>
      tx.query<{ relationship: string; review_count: string }>("select * from public.profile_review_stats($1)", [ANA]),
    );
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].relationship).toBe("tenant_to_landlord");
  });

  it("la reseña de Elena sigue oculta por el doble ciego", async () => {
    const read = (viewer: string | null) =>
      as(db, viewer, (tx) => tx.query("select id from public.reviews where stay_id = $1", [ELENA_STAY])).then(
        (r) => r.rows.length,
      );
    expect(await read(null)).toBe(0);
    expect(await read(DIEGO)).toBe(0);
    expect(await read(ELENA)).toBe(1);
  });
});
