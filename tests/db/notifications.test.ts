import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActiveListing } from "./fixtures";
import { as, createTestDb, createUser, type Db } from "./helpers";

// Auditoría I1: avisos que se ven, se atienden y no se repiten.
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const MSG = "Hola, me encaja mucho la habitación. ¿Podría verla esta semana?";
const TEXT = "CONTRATO DE ARRENDAMIENTO DE HABITACIÓN\n\n" + "Cláusula de prueba con texto suficiente. ".repeat(20);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const TERMS = { landlord_name: "Ana Casera López", tenant_name: "Bruno Inquilino Pérez", address: "Rúa da Raíña 12, 27001 Lugo", monthly_rent: 320, deposit: 320, payment_day: 5, start_date: "2027-09-01" };

type Notice = { id: string; kind: string; title: string; url: string | null; needs_action: boolean; pending: boolean; resolved_at: Date | null; read_at: Date | null };
const mine = (user: string) => as(db, user, async (tx) => (await tx.query<Notice>("select * from public.my_notifications()")).rows);
const count = (user: string) => as(db, user, async (tx) => (await tx.query<{ n: number }>("select public.my_notification_count() as n")).rows[0].n);
const system = (user: string, kind: string, title: string, url: string | null = "/contratos/x", body: string | null = null) =>
  db.query("insert into public.notifications (user_id, kind, title, body, url) values ($1, $2, $3, $4, $5)", [user, kind, title, body, url]);

async function sentContract() {
  const host = await createUser(db, "Ana Casera");
  const guest = await createUser(db, "Bruno Inquilino");
  const listing = (await createActiveListing(db, host)).id;
  const interest = await as(db, guest, async (tx) =>
    (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [listing, guest, MSG])).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("update public.interests set status = 'accepted' where id = $1", [interest]));
  const id = await as(db, host, async (tx) =>
    (await tx.query<{ id: string }>(
      "insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms) values ($1, $2, $3, $4, 'room', 'v1', $5) returning id",
      [listing, interest, host, guest, JSON.stringify(TERMS)],
    )).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("select public.send_contract($1, $2)", [id, TEXT]));
  return { host, guest, id };
}

describe("avisos (auditoría I1)", () => {
  it("el contrato para firmar cuenta como pendiente y deja de pedir acción al firmar", async () => {
    const c = await sentContract();
    expect(await count(c.guest)).toBe(1);
    const [notice] = await mine(c.guest);
    expect(notice).toMatchObject({ kind: "contract_to_sign", url: `/contratos/${c.id}`, needs_action: true, pending: true });

    // Leerlo (abrirlo) no lo da por atendido: sigue tocándole firmar.
    await as(db, c.guest, (tx) => tx.query("update public.notifications set read_at = now() where id = $1", [notice.id]));
    expect(await count(c.guest)).toBe(1);

    // Firma: el aviso queda atendido aunque el casero aún no haya firmado.
    await as(db, c.guest, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [c.id, "Bruno Inquilino Pérez", sha(TEXT)]));
    expect(await count(c.guest)).toBe(0);
    expect((await mine(c.guest))[0]).toMatchObject({ kind: "contract_to_sign", needs_action: false, pending: false });
    expect((await mine(c.guest))[0].resolved_at).not.toBeNull();

    // Firmado por los dos: novedad para ambos, que deja de contar al leerla.
    await as(db, c.host, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [c.id, "Ana Casera López", sha(TEXT)]));
    expect(await count(c.guest)).toBe(1);
    expect((await mine(c.guest))[0]).toMatchObject({ kind: "contract_signed", needs_action: false, pending: true });
    await as(db, c.guest, (tx) => tx.query("update public.notifications set read_at = now() where read_at is null"));
    expect(await count(c.guest)).toBe(0);
  });

  it("cancelar el contrato también deja atendido el aviso de firma", async () => {
    const c = await sentContract();
    await as(db, c.host, (tx) => tx.query("select public.cancel_contract($1)", [c.id]));
    const kinds = (await mine(c.guest)).filter((n) => n.needs_action).map((n) => n.kind);
    expect(kinds).toEqual([]);
  });

  it("el inventario por confirmar se atiende al confirmarlo", async () => {
    const c = await sentContract();
    await as(db, c.guest, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [c.id, "Bruno Inquilino Pérez", sha(TEXT)]));
    await as(db, c.host, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [c.id, "Ana Casera López", sha(TEXT)]));
    const inv = await as(db, c.host, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.contract_inventories (contract_id, stage) values ($1, 'entry') returning id", [c.id])).rows[0].id,
    );
    await as(db, c.host, (tx) => tx.query("insert into public.inventory_items (inventory_id, area, name, condition) values ($1, 'Salón', 'Sofá', 'good')", [inv]));
    const confirm = (user: string) =>
      as(db, user, (tx) => tx.query("select public.confirm_inventory($1, (select revision from public.contract_inventories where id = $1))", [inv]));
    await confirm(c.host);
    const pending = (await mine(c.guest)).filter((n) => n.needs_action);
    expect(pending.map((n) => n.kind)).toEqual(["inventory_to_confirm"]);
    expect(pending[0].url).toBe(`/contratos/${c.id}/inventario/entrada`);
    await confirm(c.guest);
    expect((await mine(c.guest)).filter((n) => n.needs_action)).toEqual([]);
  });

  it("un aviso nuevo sustituye a los iguales o del mismo asunto: no se acumulan", async () => {
    const user = await createUser(db, "Carla Avisos");
    const url = "/contratos/11111111-1111-4111-8111-111111111111";
    for (let i = 0; i < 3; i++) await system(user, "deposit_return_marked", "Tu casero dice que te ha devuelto la fianza", url, "Fecha de devolución: 16/11/2026.");
    let list = await mine(user);
    expect(list).toHaveLength(3);
    expect(list.filter((n) => n.pending)).toHaveLength(1);
    expect(await count(user)).toBe(1);

    // La declaración de llaves y sus recordatorios: solo vale el último.
    await system(user, "deposit_keys_declared", "Confirma la entrega de llaves", url);
    await system(user, "deposit_keys_reminder", "Recordatorio: confirma la entrega de llaves", url);
    await system(user, "deposit_keys_reminder", "Recordatorio: confirma la entrega de llaves", url);
    list = await mine(user);
    expect(list.filter((n) => n.pending).map((n) => n.kind).sort()).toEqual(["deposit_keys_reminder", "deposit_return_marked"]);
    // El mismo aviso sobre OTRO contrato no se toca.
    await system(user, "deposit_return_marked", "Tu casero dice que te ha devuelto la fianza", "/contratos/22222222-2222-4222-8222-222222222222");
    expect(await count(user)).toBe(3);
    // Los pendientes salen primero.
    expect((await mine(user)).slice(0, 3).every((n) => n.pending)).toBe(true);
  });

  it("cada uno ve y cuenta solo los suyos; sin sesión no se puede ni preguntar; nadie se marca avisos como atendidos", async () => {
    const a = await createUser(db, "Dani Avisos");
    const b = await createUser(db, "Eva Avisos");
    await system(a, "contract_to_sign", "Tienes un contrato para firmar", "/contratos/33333333-3333-4333-8333-333333333333");
    expect(await count(a)).toBe(1);
    expect(await count(b)).toBe(0);
    expect(await mine(b)).toEqual([]);
    await expect(db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select public.my_notification_count()"); })).rejects.toThrow(/permission denied/);
    await expect(db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select * from public.my_notifications()"); })).rejects.toThrow(/permission denied/);
    // «Atendido» lo decide la base de datos: el usuario solo puede marcar como leído.
    await expect(as(db, a, (tx) => tx.query("update public.notifications set resolved_at = now()"))).rejects.toThrow(/permission denied/);
    await as(db, a, (tx) => tx.query("update public.notifications set read_at = now()"));
    expect(await count(a)).toBe(1); // sigue tocándole firmar
  });
});
