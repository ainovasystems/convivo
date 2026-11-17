import { createHash } from "node:crypto";

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

const MSG = "Hola, me encaja mucho la habitación. ¿Podría verla esta semana?";
const TEXT = "CONTRATO DE ARRENDAMIENTO DE HABITACIÓN\n\n" + "Cláusula de prueba con texto suficiente. ".repeat(20);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const TERMS = {
  landlord_name: "Ana Casera López",
  tenant_name: "Bruno Inquilino Pérez",
  address: "Rúa da Raíña 12, 2º B, 27001 Lugo",
  monthly_rent: 320,
  deposit: 320,
  payment_day: 5,
  start_date: "2025-01-01",
};

type Row = Record<string, unknown>;
const run = (user: string, sql: string, params: unknown[] = []) => as(db, user, async (tx) => (await tx.query<Row>(sql, params)).rows[0]);
const runAll = (user: string | null, sql: string, params: unknown[] = []) => as(db, user, async (tx) => (await tx.query<Row>(sql, params)).rows);

type Item = [area: string, name: string, condition: "new" | "good" | "worn" | "damaged"];
const ENTRY: Item[] = [
  ["Cocina", "Nevera", "good"],
  ["Habitación", "Colchón", "new"],
  ["Baño", "Espejo", "damaged"],
  ["Salón", "Sofá", "good"],
];
const EXIT: Item[] = [
  ["Cocina", "Nevera", "damaged"], // daño nuevo
  ["Habitación", "Colchón", "worn"], // desgaste: no descontable
  ["Baño", "Espejo", "damaged"], // ya estaba dañado en la entrada
  ["Salón", "Sofá", "good"],
  ["Terraza", "Mesa", "damaged"], // sin equivalente en la entrada
];

async function lockedInventory(host: string, guest: string, contractId: string, stage: "entry" | "exit", items: Item[]) {
  const inv = (await run(guest, "insert into public.contract_inventories (contract_id, stage) values ($1, $2) returning id", [contractId, stage])).id as string;
  const ids: Record<string, string> = {};
  for (const [area, name, condition] of items) {
    ids[`${area}|${name}`] = (
      await run(host, "insert into public.inventory_items (inventory_id, area, name, condition) values ($1, $2, $3, $4) returning id", [inv, area, name, condition])
    ).id as string;
    // created_at distinto para que «el último» sea determinista
    await db.query("select pg_sleep(0.002)");
  }
  await run(host, "select public.confirm_inventory($1, (select revision from public.contract_inventories where id = $1))", [inv]);
  await run(guest, "select public.confirm_inventory($1, (select revision from public.contract_inventories where id = $1))", [inv]);
  return { inv, ids };
}

/** Contrato firmado con los dos inventarios bloqueados. */
async function world({ exitLocked = true, deposit = 320 }: { exitLocked?: boolean; deposit?: number } = {}) {
  const host = await createUser(db, "Ana Casera");
  const guest = await createUser(db, "Bruno Inquilino");
  const listing = (await createActiveListing(db, host)).id;
  const interest = await as(db, guest, async (tx) =>
    (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [listing, guest, MSG])).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("update public.interests set status = 'accepted' where id = $1", [interest]));
  const id = await as(db, host, async (tx) =>
    (await tx.query<{ id: string }>(
      `insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms)
       values ($1, $2, $3, $4, 'room', 'v1', $5) returning id`,
      [listing, interest, host, guest, JSON.stringify({ ...TERMS, deposit })],
    )).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("select public.send_contract($1, $2)", [id, TEXT]));
  await as(db, guest, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Bruno Inquilino Pérez", sha(TEXT)]));
  await as(db, host, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Ana Casera López", sha(TEXT)]));
  const entry = await lockedInventory(host, guest, id, "entry", ENTRY);
  const exit = exitLocked ? await lockedInventory(host, guest, id, "exit", EXIT) : null;
  return { host, guest, id, entry, exit, ex: exit?.ids ?? {} };
}
type World = Awaited<ReturnType<typeof world>>;

const open = (user: string, id: string) => run(user, "select * from public.open_settlement($1)", [id]);
const save = (user: string, sid: string, concept: string, amount: number, element: string | null = null, itemId: string | null = null) =>
  run(user, "select * from public.save_settlement_item($1, $2, $3, $4, $5)", [sid, itemId, concept, amount, element]);
const send = (user: string, sid: string) => run(user, "select * from public.send_settlement($1)", [sid]);
const reopen = (user: string, sid: string) => run(user, "select * from public.reopen_settlement($1)", [sid]);
const confirm = (user: string, sid: string) => run(user, "select * from public.confirm_settlement($1)", [sid]);
const respond = (user: string, sid: string, answers: { item_id: unknown; response: string; comment?: string }[]) =>
  run(user, "select * from public.respond_settlement($1, $2::jsonb)", [sid, JSON.stringify(answers)]);
const settlement = async (id: string) => (await db.query<Row>("select * from public.contract_settlements where id = $1", [id])).rows[0];
const items = async (sid: string) => (await db.query<Row>("select * from public.settlement_items where settlement_id = $1 order by sort_order", [sid])).rows;
const events = async (contractId: string) =>
  (await db.query<{ kind: string }>("select kind from public.contract_deposit_events where contract_id = $1 and kind like 'settlement%' order by id", [contractId])).rows.map((r) => r.kind);
const kinds = async (user: string) => (await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [user])).rows.map((r) => r.kind);

/** Liquidación enviada con dos partidas (una con elemento). */
async function sent(w: World) {
  const s = (await open(w.host, w.id)).id as string;
  const fridge = (await save(w.host, s, "Reparación de la nevera", 120, w.ex["Cocina|Nevera"])).id as string;
  const bills = (await save(w.host, s, "Suministros pendientes", 45.5)).id as string;
  await send(w.host, s);
  return { s, fridge, bills };
}

describe("liquidación de salida · apertura y partidas", () => {
  it("la abre solo el casero y solo con el inventario de salida bloqueado; una por contrato", async () => {
    const early = await world({ exitLocked: false });
    await expect(open(early.host, early.id)).rejects.toThrow(/inventario de salida/);

    const w = await world();
    const stranger = await createUser(db, "Extraña Liquidación");
    await expect(open(w.guest, w.id)).rejects.toThrow(/Solo quien alquila la vivienda abre/);
    await expect(open(stranger, w.id)).rejects.toThrow(/no encontrado/);
    const s = await open(w.host, w.id);
    expect(s).toMatchObject({ status: "draft", contract_id: w.id });
    expect(Number(s.deposit_amount)).toBe(320);
    await expect(open(w.host, w.id)).rejects.toThrow(/ya está abierta/);
    expect(await events(w.id)).toEqual(["settlement_opened"]);
  });

  it("sin fianza o con la devolución ya confirmada, no se abre", async () => {
    const free = await world({ deposit: 0 });
    await expect(open(free.host, free.id)).rejects.toThrow(/no tiene fianza/);

    const w = await world();
    await db.query(
      `insert into public.contract_deposits (contract_id, status, return_marked_on, return_marked_at, return_response, return_response_at)
       values ($1, 'returned', current_date, now(), 'confirmed', now())`,
      [w.id],
    );
    await expect(open(w.host, w.id)).rejects.toThrow(/devolución de la fianza ya está confirmada/);
  });

  it("solo se ofrecen como descontables los daños nuevos: el desgaste, lo ya dañado y lo sin equivalente en la entrada, no", async () => {
    const w = await world();
    const s = (await open(w.host, w.id)).id as string;
    const ok = await save(w.host, s, "Reparación de la nevera", 120, w.ex["Cocina|Nevera"]);
    expect(ok.inventory_item_id).toBe(w.ex["Cocina|Nevera"]);
    const notDeductible = /Solo se puede descontar un daño nuevo/;
    await expect(save(w.host, s, "Colchón", 50, w.ex["Habitación|Colchón"])).rejects.toThrow(notDeductible); // desgaste
    await expect(save(w.host, s, "Espejo", 50, w.ex["Baño|Espejo"])).rejects.toThrow(notDeductible); // ya dañado
    await expect(save(w.host, s, "Sofá", 50, w.ex["Salón|Sofá"])).rejects.toThrow(notDeductible); // sin daños
    await expect(save(w.host, s, "Mesa", 50, w.ex["Terraza|Mesa"])).rejects.toThrow(notDeductible); // sin equivalente
    await expect(save(w.host, s, "Otra vez la nevera", 50, w.ex["Cocina|Nevera"])).rejects.toThrow(/duplicate key|unique/i);
    // Un elemento del inventario de ENTRADA o de otro contrato no vale.
    await expect(save(w.host, s, "Nevera (entrada)", 50, w.entry.ids["Cocina|Nevera"])).rejects.toThrow(notDeductible);
    const other = await world();
    await expect(save(w.host, s, "De otro contrato", 50, other.ex["Cocina|Nevera"])).rejects.toThrow(notDeductible);
    // Una partida sin elemento (p. ej. suministros) es libre.
    expect((await save(w.host, s, "  Suministros pendientes  ", 45.5)).concept).toBe("Suministros pendientes");
  });

  it("validaciones de la partida y permisos", async () => {
    const w = await world();
    const s = (await open(w.host, w.id)).id as string;
    await expect(save(w.guest, s, "Algo", 10)).rejects.toThrow(/Solo quien alquila la vivienda prepara/);
    await expect(save(w.host, s, "   ", 10)).rejects.toThrow(/concepto/);
    await expect(save(w.host, s, "Algo", 0)).rejects.toThrow(/mayor que cero/);
    await expect(save(w.host, s, "Algo", -5)).rejects.toThrow(/mayor que cero/);
    const a = (await save(w.host, s, "Algo", 10)).id as string;
    expect(Number((await save(w.host, s, "Algo corregido", 12.345, null, a)).amount)).toBe(12.35);
    await expect(run(w.guest, "select public.delete_settlement_item($1)", [a])).rejects.toThrow(/no encontrada/);
    await run(w.host, "select public.delete_settlement_item($1)", [a]);
    expect(await items(s)).toEqual([]);
  });

  it("el total de descuentos puede superar la fianza (solo se avisa en la app); no se decide nada", async () => {
    const w = await world();
    const s = (await open(w.host, w.id)).id as string;
    await save(w.host, s, "Pintura de toda la vivienda", 900);
    expect((await items(s)).map((i) => Number(i.amount))).toEqual([900]);
  });
});

describe("liquidación de salida · envío, respuesta y confirmación", () => {
  it("el casero envía; con partidas fijas, hash y aviso al inquilino", async () => {
    const w = await world();
    const { s, fridge } = await sent(w);
    const row = await settlement(s);
    expect(row.status).toBe("sent");
    expect(row.sent_at).toBeTruthy();
    expect(String(row.sent_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(await kinds(w.guest)).toContain("settlement_sent");
    // Auditoría B2: el aviso dice el total exacto y con coma decimal (120 + 45,50).
    const body = (await db.query<{ body: string }>("select body from public.notifications where user_id = $1 and kind = 'settlement_sent'", [w.guest])).rows[0].body;
    expect(body).toContain("2 partidas por un total de 165,50 €. Responde");
    expect(body).not.toContain("165.50");
    await expect(send(w.host, s)).rejects.toThrow(/ya está enviada/);
    await expect(save(w.host, s, "Nueva", 10)).rejects.toThrow(/ya está enviada/);
    await expect(save(w.host, s, "Cambio", 10, null, fridge)).rejects.toThrow(/ya está enviada/);
    await expect(db.query("update public.settlement_items set amount = 1 where id = $1", [fridge])).rejects.toThrow(/no se pueden modificar/);
    await expect(db.query("delete from public.settlement_items where id = $1", [fridge])).rejects.toThrow(/no se pueden quitar/);
    await expect(send(w.guest, s)).rejects.toThrow(/Solo quien alquila la vivienda envía/);
  });

  it("el inquilino responde partida por partida; no acepta ⇒ con discrepancias; hace falta comentario", async () => {
    const w = await world();
    const { s, fridge, bills } = await sent(w);
    await expect(respond(w.host, s, [])).rejects.toThrow(/Solo quien alquila responde/);
    await expect(respond(w.guest, s, [{ item_id: fridge, response: "accepted" }])).rejects.toThrow(/todas las partidas/);
    await expect(respond(w.guest, s, [{ item_id: fridge, response: "talvez" }, { item_id: bills, response: "accepted" }])).rejects.toThrow(/aceptas o no/);
    await expect(respond(w.guest, s, [{ item_id: fridge, response: "rejected" }, { item_id: bills, response: "accepted" }])).rejects.toThrow(/Explica con unas palabras/);
    await expect(respond(w.guest, s, [{ item_id: fridge, response: "accepted" }, { item_id: fridge, response: "accepted" }])).rejects.toThrow(/una sola vez/);

    const row = await respond(w.guest, s, [
      { item_id: fridge, response: "rejected", comment: "La nevera ya hacía ruido cuando entré" },
      { item_id: bills, response: "accepted" },
    ]);
    expect(row.status).toBe("disputed");
    expect((await items(s)).map((i) => i.tenant_response)).toEqual(["rejected", "accepted"]);
    expect(await kinds(w.host)).toContain("settlement_answered");
    // Puede cambiar sus respuestas mientras no esté cerrada.
    const again = await respond(w.guest, s, [
      { item_id: fridge, response: "accepted" },
      { item_id: bills, response: "accepted", comment: "Vale" },
    ]);
    expect(again.status).toBe("agreed");
    expect(await events(w.id)).toEqual(["settlement_opened", "settlement_sent", "settlement_answered", "settlement_answered"]);
  });

  it("las dos partes confirman al final: queda bloqueada, con huella, y es inmutable para cualquier rol", async () => {
    const w = await world();
    const { s, fridge, bills } = await sent(w);
    await expect(confirm(w.host, s)).rejects.toThrow(/ha respondido/);
    await respond(w.guest, s, [
      { item_id: fridge, response: "rejected", comment: "No fue por mi culpa" },
      { item_id: bills, response: "accepted" },
    ]);
    const first = await confirm(w.host, s);
    expect(first.locked_at).toBeNull();
    expect(await kinds(w.guest)).toContain("settlement_to_confirm");
    await expect(confirm(w.host, s)).rejects.toThrow(/Ya has confirmado/);
    const done = await confirm(w.guest, s);
    expect(done.locked_at).toBeTruthy();
    expect(done.status).toBe("disputed"); // consta la discrepancia
    expect(String(done.final_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(done.final_hash).not.toBe(done.sent_hash);
    expect(await kinds(w.host)).toContain("settlement_locked");
    expect(await events(w.id)).toEqual([
      "settlement_opened", "settlement_sent", "settlement_answered", "settlement_confirmed", "settlement_confirmed", "settlement_locked",
    ]);

    // Bloqueada: nadie la toca (ni service_role), ni responder, ni reabrir, ni confirmar otra vez.
    await expect(respond(w.guest, s, [{ item_id: fridge, response: "accepted" }, { item_id: bills, response: "accepted" }])).rejects.toThrow(/no se puede modificar/);
    await expect(reopen(w.host, s)).rejects.toThrow(/no se puede modificar/);
    await expect(confirm(w.guest, s)).rejects.toThrow(/ya está confirmada/);
    await expect(db.query("update public.contract_settlements set status = 'agreed' where id = $1", [s])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("update public.settlement_items set tenant_response = 'accepted' where id = $1", [fridge])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("delete from public.settlement_items where id = $1", [fridge])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("delete from public.contract_settlements where id = $1", [s])).rejects.toThrow(/no se puede borrar/);
    await expect(db.query("insert into public.settlement_items (settlement_id, concept, amount) values ($1, 'Nueva', 5)", [s])).rejects.toThrow(/no se puede modificar/);
  });

  it("de acuerdo: todas aceptadas; el cambio de respuestas anula las confirmaciones", async () => {
    const w = await world();
    const { s, fridge, bills } = await sent(w);
    const all = [{ item_id: fridge, response: "accepted" }, { item_id: bills, response: "accepted" }];
    expect((await respond(w.guest, s, all)).status).toBe("agreed");
    await confirm(w.host, s);
    // Si el inquilino cambia algo, el casero tiene que volver a confirmar.
    await respond(w.guest, s, all);
    const row = await settlement(s);
    expect(row.landlord_confirmed_at).toBeNull();
    expect(row.locked_at).toBeNull();
  });

  it("sin partidas se envía directamente «de acuerdo» y las dos partes la confirman", async () => {
    const w = await world();
    const s = (await open(w.host, w.id)).id as string;
    expect((await send(w.host, s)).status).toBe("agreed");
    await confirm(w.host, s);
    expect((await confirm(w.guest, s)).locked_at).toBeTruthy();
  });

  it("reabrir: vuelve a «en preparación», borra las respuestas y deja copia en la cronología", async () => {
    const w = await world();
    const { s, fridge, bills } = await sent(w);
    await expect(reopen(w.host, s).then(() => reopen(w.host, s))).rejects.toThrow(/ya está en preparación/);
    await send(w.host, s); // la primera llamada la reabrió: la volvemos a enviar
    await respond(w.guest, s, [
      { item_id: fridge, response: "rejected", comment: "No estoy de acuerdo con el importe" },
      { item_id: bills, response: "accepted" },
    ]);
    await expect(reopen(w.guest, s)).rejects.toThrow(/Solo quien alquila la vivienda reabre/);
    const row = await reopen(w.host, s);
    expect(row.status).toBe("draft");
    expect(row.sent_hash).toBeNull();
    expect((await items(s)).every((i) => i.tenant_response === null && i.tenant_comment === null)).toBe(true);
    const ev = (await db.query<{ data: { previous: { concept: string; response: string | null; comment: string | null }[] } }>(
      "select data from public.contract_deposit_events where contract_id = $1 and kind = 'settlement_reopened' order by id desc limit 1",
      [w.id],
    )).rows[0];
    expect(ev.data.previous).toEqual([
      { concept: "Reparación de la nevera", amount: 120, response: "rejected", comment: "No estoy de acuerdo con el importe" },
      { concept: "Suministros pendientes", amount: 45.5, response: "accepted", comment: null },
    ]);
    expect(await kinds(w.guest)).toContain("settlement_reopened");
    // Editable otra vez y ya no se puede responder ni confirmar.
    await save(w.host, s, "Reparación de la nevera (corregida)", 90, null, fridge);
    await expect(respond(w.guest, s, [])).rejects.toThrow(/todavía no ha enviado/);
    await expect(confirm(w.host, s)).rejects.toThrow(/ha respondido/);
  });
});

describe("liquidación de salida · permisos, RLS y borrado de cuenta", () => {
  it("solo las partes la ven; nadie escribe a mano (ni anon)", async () => {
    const w = await world();
    const { s, fridge } = await sent(w);
    const stranger = await createUser(db, "Extraño Liquidación");
    for (const user of [w.host, w.guest]) {
      expect(await runAll(user, "select id from public.contract_settlements")).toHaveLength(1);
      expect(await runAll(user, "select id from public.settlement_items")).toHaveLength(2);
    }
    expect(await runAll(stranger, "select id from public.contract_settlements")).toEqual([]);
    expect(await runAll(stranger, "select id from public.settlement_items")).toEqual([]);
    await expect(runAll(null, "select * from public.contract_settlements")).rejects.toThrow(/permission denied/);
    await expect(runAll(null, "select * from public.settlement_items")).rejects.toThrow(/permission denied/);
    for (const user of [w.host, w.guest]) {
      await expect(run(user, "update public.contract_settlements set status = 'agreed' where id = $1", [s])).rejects.toThrow(/permission denied/);
      await expect(run(user, "update public.settlement_items set tenant_response = 'accepted' where id = $1", [fridge])).rejects.toThrow(/permission denied/);
      await expect(run(user, "insert into public.settlement_items (settlement_id, concept, amount) values ($1, 'x', 1)", [s])).rejects.toThrow(/permission denied/);
      await expect(run(user, "delete from public.settlement_items where id = $1", [fridge])).rejects.toThrow(/permission denied/);
    }
    await expect(respond(stranger, s, [])).rejects.toThrow(/no encontrada/);
    await expect(confirm(stranger, s)).rejects.toThrow(/no encontrada/);
    await expect(runAll(null, "select public.open_settlement($1)", [w.id])).rejects.toThrow(/permission denied/);
    await expect(runAll(null, "select public.confirm_settlement($1)", [s])).rejects.toThrow(/permission denied/);
  });

  it("borrar la cuenta de una parte conserva la liquidación y su cronología", async () => {
    const w = await world();
    const { s, fridge, bills } = await sent(w);
    await respond(w.guest, s, [{ item_id: fridge, response: "accepted" }, { item_id: bills, response: "accepted" }]);
    await as(db, w.guest, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    expect((await settlement(s)).status).toBe("agreed");
    expect(await items(s)).toHaveLength(2);
    expect(await events(w.id)).toEqual(["settlement_opened", "settlement_sent", "settlement_answered"]);
    expect(await runAll(w.host, "select id from public.contract_settlements")).toHaveLength(1);
  });
});
