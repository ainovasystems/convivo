import { beforeAll, describe, expect, it } from "vitest";

import { createTestDb, createUser, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("textos de la base de datos con la marca Hommie", () => {
  it("el aviso de edad mínima dice Hommie", async () => {
    const id = await createUser(db, "Menor");
    const year = new Date().getFullYear() - 16;
    await expect(db.query("update public.profiles set birth_year = $1 where id = $2", [year, id])).rejects.toThrow(
      /Para usar Hommie tienes que tener 18 años o más/,
    );
  });

  it("el aviso de liquidación enviada no nombra la marca antigua", async () => {
    const { rows } = await db.query<{ def: string }>(
      "select pg_get_functiondef('public.send_settlement(uuid)'::regprocedure) as def",
    );
    expect(rows[0].def).toContain("Hommie solo deja constancia");
    expect(rows[0].def).not.toContain("Convivo");
  });
});
