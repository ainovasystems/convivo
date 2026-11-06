import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, type Db } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const allowed = (kind: string, ip: string, email: string) =>
  as(db, null, async (tx) =>
    (await tx.query<{ ok: boolean }>("select public.auth_rate_allowed($1, $2, $3) as ok", [kind, h(ip), h(email)])).rows[0].ok,
  );
const failLogin = (ip: string, email: string) =>
  as(db, null, (tx) => tx.query("select public.auth_rate_failed($1, $2)", [h(ip), h(email)]));

describe("límite de intentos de acceso", () => {
  it("login: solo cuentan los fallos; 8 fallos bloquean esa cuenta, no otras", async () => {
    // Entrar bien muchas veces no penaliza (no se registra nada).
    for (let i = 0; i < 20; i++) expect(await allowed("login_failed", "ip-a", "ana@x.es")).toBe(true);
    for (let i = 0; i < 8; i++) await failLogin(`ip-${i}`, "victima@x.es");
    // Bloqueada aunque venga de otra IP; las demás cuentas siguen.
    expect(await allowed("login_failed", "ip-nueva", "victima@x.es")).toBe(false);
    expect(await allowed("login_failed", "ip-nueva", "otra@x.es")).toBe(true);
  });

  it("login: fallar con 30 cuentas distintas desde una IP la bloquea; equivocarse mucho con una no", async () => {
    for (let i = 0; i < 7; i++) await failLogin("ip-residencia", "despistado@x.es");
    expect(await allowed("login_failed", "ip-residencia", "companera@x.es")).toBe(true);
    for (let i = 0; i < 30; i++) await failLogin("ip-atacante", `cuenta-${i}@x.es`);
    expect(await allowed("login_failed", "ip-atacante", "cualquiera@x.es")).toBe(false);
    expect(await allowed("login_failed", "ip-normal", "cualquiera@x.es")).toBe(true);
  });

  it("registro: 3 por email y hora; enlace mágico: 5", async () => {
    for (let i = 0; i < 3; i++) expect(await allowed("signup", `ip-s${i}`, "nuevo@x.es")).toBe(true);
    expect(await allowed("signup", "ip-s9", "nuevo@x.es")).toBe(false);
    for (let i = 0; i < 5; i++) expect(await allowed("magic_link", "ip-m", "magia@x.es")).toBe(true);
    expect(await allowed("magic_link", "ip-m", "magia@x.es")).toBe(false);
  });

  it("los intentos antiguos caducan", async () => {
    for (let i = 0; i < 8; i++) await failLogin("ip-v", "vieja@x.es");
    expect(await allowed("login_failed", "ip-v", "vieja@x.es")).toBe(false);
    await db.query("update public.auth_attempts set created_at = now() - interval '16 minutes' where email_hash = $1", [
      h("vieja@x.es"),
    ]);
    expect(await allowed("login_failed", "ip-v", "vieja@x.es")).toBe(true);
  });

  it("solo acepta huellas y tipos válidos, y nadie lee la tabla", async () => {
    await expect(
      as(db, null, (tx) => tx.query("select public.auth_rate_allowed('login_failed', '1.2.3.4', 'ana@x.es')")),
    ).rejects.toThrow(/Huella no válida/);
    await expect(as(db, null, (tx) => tx.query("select public.auth_rate_allowed('otro', $1, $1)", [h("x")]))).rejects.toThrow(
      /no válido/,
    );
    await expect(as(db, null, (tx) => tx.query("select * from public.auth_attempts"))).rejects.toThrow(/permission denied/);
    await expect(
      as(db, null, (tx) =>
        tx.query("insert into public.auth_attempts (kind, ip_hash, email_hash) values ('signup', $1, $1)", [h("x")]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
