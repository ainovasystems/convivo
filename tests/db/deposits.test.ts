import { createHash, randomUUID } from "node:crypto";

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
  start_date: "2025-01-01", // en el pasado: la entrega de llaves tiene que ser posterior
};

/** Fecha de hoy en España ± n días, como 'YYYY-MM-DD'. */
const day = async (n = 0) =>
  (await db.query<{ d: string }>("select to_char(private.today_es() + $1::int, 'YYYY-MM-DD') as d", [n])).rows[0].d;

async function contract({ sign = true, deposit = 320, ended = true }: { sign?: boolean; deposit?: number; ended?: boolean } = {}) {
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
  let stayId: string | null = null;
  if (sign) {
    await as(db, guest, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Bruno Inquilino Pérez", sha(TEXT)]));
    await as(db, host, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Ana Casera López", sha(TEXT)]));
    stayId = (await db.query<{ stay_id: string }>("select stay_id from public.contracts where id = $1", [id])).rows[0].stay_id;
    if (ended) await as(db, host, (tx) => tx.query("select public.end_stay($1, $2::date)", [stayId, TERMS.start_date]));
  }
  return { host, guest, id, stayId };
}

type Row = Record<string, unknown>;
const run = (user: string, sql: string, params: unknown[]) => as(db, user, async (tx) => (await tx.query<Row>(sql, params)).rows[0]);
const record = (user: string, id: string, on: string, number = "RES-2027/00123", path: string | null = null) =>
  run(user, "select * from public.record_deposit($1, $2::date, $3, $4)", [id, on, number, path]);
const declare = (user: string, id: string, on: string) => run(user, "select * from public.declare_keys_handover($1, $2::date)", [id, on]);
const confirmKeys = (user: string, id: string) => run(user, "select * from public.confirm_keys_handover($1)", [id]);
const markReturned = (user: string, id: string, on: string, amount: number | null = null) =>
  run(user, "select * from public.mark_deposit_returned($1, $2::date, $3)", [id, on, amount]);
const respond = (user: string, id: string, received: boolean) => run(user, "select * from public.respond_deposit_return($1, $2)", [id, received]);
const deposit = async (id: string) =>
  (await db.query<Row>("select * from public.contract_deposits where contract_id = $1", [id])).rows[0];
const events = async (id: string) =>
  (await db.query<{ kind: string }>("select kind from public.contract_deposit_events where contract_id = $1 order by id", [id])).rows.map((r) => r.kind);
const kinds = async (user: string) =>
  (await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [user])).rows.map((r) => r.kind);
const timers = () =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query<{ contract_id: string; user_id: string; kind: string; party: string }>("select * from public.deposit_timers_run()")).rows;
  });

/** Contrato con llaves confirmadas por el casero `keysDaysAgo` días atrás. */
async function withKeys(keysDaysAgo: number) {
  const c = await contract();
  await declare(c.guest, c.id, await day(-keysDaysAgo));
  await confirmKeys(c.host, c.id);
  return c;
}

describe("seguimiento de la fianza · depósito", () => {
  it("solo con el contrato firmado y con fianza", async () => {
    const pending = await contract({ sign: false });
    await expect(record(pending.host, pending.id, await day(-1))).rejects.toThrow(/habéis firmado/);
    const free = await contract({ deposit: 0 });
    await expect(record(free.host, free.id, await day(-1))).rejects.toThrow(/no tiene fianza/);
  });

  it("el casero anota el depósito; el inquilino y las demás personas no", async () => {
    const c = await contract();
    const stranger = await createUser(db, "Extraña Fianza");
    await expect(record(c.guest, c.id, await day(-1))).rejects.toThrow(/Solo quien alquila la vivienda anota/);
    await expect(record(stranger, c.id, await day(-1))).rejects.toThrow(/no encontrado/);
    await expect(record(c.host, c.id, await day(1))).rejects.toThrow(/fecha del depósito/);
    await expect(record(c.host, c.id, await day(-1), "   ")).rejects.toThrow(/número de resguardo/);
    await expect(record(c.host, c.id, await day(-1), "X", `${randomUUID()}/${randomUUID()}.pdf`)).rejects.toThrow(/Resguardo no válido/);

    const row = await record(c.host, c.id, await day(-1));
    expect(row.status).toBe("deposited");
    expect(await kinds(c.guest)).toContain("deposit_recorded");
    expect(await events(c.id)).toEqual(["deposit_recorded"]);
    await expect(record(c.host, c.id, await day(-2), "OTRO")).rejects.toThrow(/ya consta como depositada/);
  });

  it("las partes ven estado, fecha y número, pero nunca la ruta del resguardo", async () => {
    const c = await contract();
    const stranger = await createUser(db, "Extraño Resguardo");
    const path = `${c.id}/${randomUUID()}.pdf`;
    await record(c.host, c.id, await day(-1), "RES-1", path);
    for (const user of [c.host, c.guest]) {
      const r = await run(user, "select status, receipt_number, deposited_on, has_receipt from public.contract_deposits where contract_id = $1", [c.id]);
      expect(r).toMatchObject({ status: "deposited", receipt_number: "RES-1", has_receipt: true });
      await expect(run(user, "select receipt_path from public.contract_deposits where contract_id = $1", [c.id])).rejects.toThrow(/permission denied/);
      await expect(run(user, "select * from public.contract_deposits where contract_id = $1", [c.id])).rejects.toThrow(/permission denied/);
    }
    expect(await as(db, stranger, async (tx) => (await tx.query("select status from public.contract_deposits")).rows)).toEqual([]);
    expect(await as(db, stranger, async (tx) => (await tx.query("select kind from public.contract_deposit_events")).rows)).toEqual([]);
    // La ruta solo se la da la función al casero.
    expect((await run(c.host, "select public.deposit_receipt_path($1) as p", [c.id])).p).toBe(path);
    expect((await run(c.guest, "select public.deposit_receipt_path($1) as p", [c.id])).p).toBeNull();
    expect((await run(stranger, "select public.deposit_receipt_path($1) as p", [c.id])).p).toBeNull();
  });

  it("nadie escribe a mano: ni las partes ni anon; y lo anotado es inmutable también para service_role", async () => {
    const c = await contract();
    await record(c.host, c.id, await day(-1));
    await expect(run(c.host, "update public.contract_deposits set status = 'returned' where contract_id = $1", [c.id])).rejects.toThrow(/permission denied/);
    await expect(run(c.guest, "insert into public.contract_deposits (contract_id) values ($1)", [c.id])).rejects.toThrow(/permission denied/);
    await expect(run(c.host, "delete from public.contract_deposits where contract_id = $1", [c.id])).rejects.toThrow(/permission denied/);
    await expect(as(db, null, (tx) => tx.query("select * from public.contract_deposits"))).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.contract_deposits set receipt_number = 'otro' where contract_id = $1", [c.id])).rejects.toThrow(/ya está anotado/);
    await expect(db.query("delete from public.contract_deposits where contract_id = $1", [c.id])).rejects.toThrow(/no se puede borrar/);
  });

  it("el resguardo se sube después una sola vez", async () => {
    const c = await contract();
    const path = `${c.id}/${randomUUID()}.jpg`;
    await expect(run(c.host, "select * from public.attach_deposit_receipt($1, $2)", [c.id, path])).rejects.toThrow(/Primero anota/);
    await record(c.host, c.id, await day(-1));
    await expect(run(c.guest, "select * from public.attach_deposit_receipt($1, $2)", [c.id, path])).rejects.toThrow(/Solo quien alquila la vivienda/);
    await expect(run(c.host, "select * from public.attach_deposit_receipt($1, $2)", [c.id, `${randomUUID()}/${randomUUID()}.jpg`])).rejects.toThrow(/no válido/);
    expect((await run(c.host, "select has_receipt from public.attach_deposit_receipt($1, $2)", [c.id, path])).has_receipt).toBe(true);
    await expect(run(c.host, "select * from public.attach_deposit_receipt($1, $2)", [c.id, `${c.id}/${randomUUID()}.jpg`])).rejects.toThrow(/no se puede sustituir/);
    await expect(db.query("update public.contract_deposits set receipt_path = null where contract_id = $1", [c.id])).rejects.toThrow(/no se puede sustituir/);
    expect(await events(c.id)).toEqual(["deposit_recorded", "receipt_attached"]);
  });

  it("storage: solo el casero lee y sube el resguardo, y solo uno", async () => {
    const c = await contract();
    await record(c.host, c.id, await day(-1));
    const name = `${c.id}/${randomUUID()}.pdf`;
    const put = (user: string | null, n: string) =>
      as(db, user, (tx) => tx.query("insert into storage.objects (bucket_id, name, owner) values ('deposit-receipts', $1, $2)", [n, user]));
    await expect(put(c.guest, name)).rejects.toThrow(/row-level security/);
    await expect(put(c.host, `${c.id}/sin-uuid.pdf`)).rejects.toThrow(/row-level security/);
    await expect(put(c.host, `${c.id}/${randomUUID()}.exe`)).rejects.toThrow(/row-level security/);
    await put(c.host, name);
    expect((await as(db, c.host, (tx) => tx.query("select name from storage.objects where name = $1", [name]))).rows).toHaveLength(1);
    // El inquilino no ve el documento.
    expect((await as(db, c.guest, (tx) => tx.query("select name from storage.objects where name = $1", [name]))).rows).toEqual([]);
    expect((await as(db, c.guest, (tx) => tx.query("delete from storage.objects where name = $1", [name]))).affectedRows).toBe(0);
    // Asociado el resguardo, ya no se sube ni se borra otro.
    await run(c.host, "select * from public.attach_deposit_receipt($1, $2)", [c.id, name]);
    await expect(put(c.host, `${c.id}/${randomUUID()}.pdf`)).rejects.toThrow(/row-level security/);
    expect((await as(db, c.host, (tx) => tx.query("delete from storage.objects where name = $1", [name]))).affectedRows).toBe(0);
  });
});

describe("seguimiento de la fianza · entrega de llaves y plazo", () => {
  it("el inquilino declara cuando la estancia ha terminado; el casero no", async () => {
    const running = await contract({ ended: false });
    await expect(declare(running.guest, running.id, await day(-1))).rejects.toThrow(/estancia haya terminado/);

    const c = await contract();
    await expect(declare(c.host, c.id, await day(-1))).rejects.toThrow(/Solo quien alquila declara/);
    await expect(declare(c.guest, c.id, await day(1))).rejects.toThrow(/fecha de entrega de llaves/);
    await expect(declare(c.guest, c.id, "2024-12-31")).rejects.toThrow(/fecha de entrega de llaves/);
    await expect(confirmKeys(c.host, c.id)).rejects.toThrow(/Todavía no hay/);

    const row = await declare(c.guest, c.id, await day(-2));
    expect(row.keys_declared_on).toBeTruthy();
    expect(await kinds(c.host)).toContain("deposit_keys_declared");
    // Mientras no esté confirmada puede corregir la fecha.
    await expect(declare(c.guest, c.id, await day(-3))).resolves.toBeTruthy();
    expect(await events(c.id)).toEqual(["keys_declared", "keys_declared"]);
  });

  it("el casero confirma: empieza el plazo de un mes y queda inmutable para cualquiera", async () => {
    const c = await contract();
    const keys = await day(-3);
    await declare(c.guest, c.id, keys);
    await expect(confirmKeys(c.guest, c.id)).rejects.toThrow(/Solo quien alquila la vivienda confirma/);
    const row = await confirmKeys(c.host, c.id);
    expect(row.keys_confirmation).toBe("landlord");
    const due = (await db.query<{ ok: boolean }>(
      "select return_due_on = (keys_declared_on + interval '1 month')::date as ok from public.contract_deposits where contract_id = $1",
      [c.id],
    )).rows[0];
    expect(due.ok).toBe(true);
    expect(await kinds(c.guest)).toContain("deposit_keys_confirmed");
    expect(await kinds(c.host)).toContain("deposit_keys_confirmed");

    await expect(confirmKeys(c.host, c.id)).rejects.toThrow(/ya está confirmada/);
    await expect(declare(c.guest, c.id, await day(-5))).rejects.toThrow(/ya está confirmada/);
    await expect(db.query("update public.contract_deposits set keys_declared_on = keys_declared_on - 10 where contract_id = $1", [c.id])).rejects.toThrow(/ya está confirmada/);
    await expect(db.query("update public.contract_deposits set return_due_on = return_due_on + 10 where contract_id = $1", [c.id])).rejects.toThrow(/ya está confirmada/);
  });

  it("nada da por confirmada la entrega de llaves: sin respuesta del casero consta como declarada y sin confirmar", async () => {
    const c = await contract();
    await declare(c.guest, c.id, await day(-2));
    await db.query("update public.contract_deposits set keys_declared_at = now() - interval '60 days' where contract_id = $1", [c.id]);
    await timers();
    // Ni la tarea diaria ni ninguna acción de las partes la confirman.
    await expect(declare(c.guest, c.id, await day(-3))).resolves.toBeTruthy();
    const row = await deposit(c.id);
    expect(row.keys_confirmed_at).toBeNull();
    expect(row.keys_confirmation).toBeNull();
    expect(row.return_due_on).toBeNull();
    expect(row.keys_declared_at).toBeTruthy();
    expect(await events(c.id)).not.toContain("keys_auto_confirmed");
    // El casero sí puede confirmarla cuando quiera.
    expect((await confirmKeys(c.host, c.id)).keys_confirmation).toBe("landlord");
  });

  it("el casero recibe recordatorios (app y tarea de email) mientras no responda, y dejan de llegar al confirmar", async () => {
    const c = await contract();
    await declare(c.guest, c.id, await day(-2));
    const mine = async () => (await timers()).filter((r) => r.contract_id === c.id && r.kind === "keys_reminder");
    expect(await mine()).toEqual([]); // aún no han pasado 3 días

    await db.query("update public.contract_deposits set keys_declared_at = now() - interval '4 days' where contract_id = $1", [c.id]);
    const first = await mine();
    expect(first.map((r) => `${r.party}:${r.kind}`)).toEqual(["landlord:keys_reminder"]);
    expect(await mine()).toEqual([]); // idempotente
    expect(await kinds(c.host)).toContain("deposit_keys_reminder");
    expect(await kinds(c.guest)).not.toContain("deposit_keys_reminder");

    await db.query("update public.contract_deposits set keys_declared_at = now() - interval '8 days' where contract_id = $1", [c.id]);
    expect(await mine()).toHaveLength(1); // segundo recordatorio (a los 7 días)
    expect((await events(c.id)).filter((k) => k === "keys_reminder")).toHaveLength(2);

    await confirmKeys(c.host, c.id);
    expect(await mine()).toEqual([]);
  });

  it("pasado un mes desde la fecha declarada y sin confirmar, se avisa a las dos partes una sola vez; la fecha sigue sin confirmar", async () => {
    const c = await contract();
    await declare(c.guest, c.id, await day(-40));
    const due = (await timers()).filter((r) => r.contract_id === c.id && r.kind === "keys_unconfirmed_due");
    expect(due.map((r) => r.party).sort()).toEqual(["landlord", "tenant"]);
    expect((await timers()).filter((r) => r.contract_id === c.id && r.kind === "keys_unconfirmed_due")).toEqual([]);
    expect(await kinds(c.guest)).toContain("deposit_keys_unconfirmed_due");
    expect(await kinds(c.host)).toContain("deposit_keys_unconfirmed_due");
    const row = await deposit(c.id);
    expect(row.keys_confirmed_at).toBeNull();
    expect(row.return_due_on).toBeNull();
    // Aún no empieza el reloj de devolución: no hay avisos de «vence» ni «vencido».
    expect(await events(c.id)).not.toContain("return_overdue");
  });

  it("avisa 7 días antes de que venza el plazo y cuando vence, una vez cada aviso", async () => {
    const soon = await withKeys(25); // vence dentro de ~5 días
    const late = await withKeys(40); // ya venció
    const far = await withKeys(5); // faltan más de 7 días
    const out = await timers();
    const mine = (id: string) => out.filter((r) => r.contract_id === id).map((r) => `${r.party}:${r.kind}`).sort();
    expect(mine(soon.id)).toEqual(["landlord:return_closing", "tenant:return_closing"]);
    expect(mine(late.id)).toEqual(["landlord:return_overdue", "tenant:return_overdue"]);
    expect(mine(far.id)).toEqual([]);
    expect(await kinds(soon.guest)).toContain("deposit_return_closing");
    expect(await kinds(late.host)).toContain("deposit_return_overdue");
    expect(await events(late.id)).toEqual(["keys_declared", "keys_confirmed", "return_overdue"]);
    expect((await timers()).filter((r) => [soon.id, late.id, far.id].includes(r.contract_id))).toEqual([]);
  });

  it("no avisa si ya está devuelta o si el casero ya marcó la devolución", async () => {
    const marked = await withKeys(40);
    await markReturned(marked.host, marked.id, await day(-1));
    const done = await withKeys(40);
    await markReturned(done.host, done.id, await day(-1));
    await respond(done.guest, done.id, true);
    expect((await timers()).filter((r) => [marked.id, done.id].includes(r.contract_id))).toEqual([]);
  });

  it("la tarea solo la ejecuta service_role", async () => {
    const c = await contract();
    await expect(as(db, c.host, (tx) => tx.query("select * from public.deposit_timers_run()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, null, (tx) => tx.query("select * from public.deposit_timers_run()"))).rejects.toThrow(/permission denied/);
  });
});

describe("seguimiento de la fianza · devolución", () => {
  it("el casero la marca con las llaves confirmadas y el inquilino la confirma: queda inmutable", async () => {
    const early = await contract();
    await expect(markReturned(early.host, early.id, await day(0))).rejects.toThrow(/llaves está confirmada/);

    const c = await withKeys(10);
    await expect(markReturned(c.guest, c.id, await day(0))).rejects.toThrow(/Solo quien alquila la vivienda marca/);
    await expect(markReturned(c.host, c.id, await day(1))).rejects.toThrow(/fecha de devolución/);
    await expect(markReturned(c.host, c.id, await day(-11))).rejects.toThrow(/fecha de devolución/);
    await expect(respond(c.guest, c.id, true)).rejects.toThrow(/No hay una devolución pendiente/);

    await markReturned(c.host, c.id, await day(-1));
    expect(await kinds(c.guest)).toContain("deposit_return_marked");
    await expect(markReturned(c.host, c.id, await day(0))).rejects.toThrow(/falta que la confirme/);
    await expect(respond(c.host, c.id, true)).rejects.toThrow(/Solo quien alquila confirma/);

    const row = await respond(c.guest, c.id, true);
    expect(row.status).toBe("returned");
    expect(await kinds(c.host)).toContain("deposit_return_confirmed");
    await expect(markReturned(c.host, c.id, await day(0))).rejects.toThrow(/ya está confirmada/);
    await expect(db.query("update public.contract_deposits set status = 'claimed' where contract_id = $1", [c.id])).rejects.toThrow(/no se puede modificar/);
    expect(await events(c.id)).toEqual(["keys_declared", "keys_confirmed", "return_marked", "return_confirmed"]);
  });

  it("si el inquilino dice que no la ha recibido, queda reclamada y el casero puede volver a marcarla", async () => {
    const c = await withKeys(10);
    await markReturned(c.host, c.id, await day(-2));
    expect((await respond(c.guest, c.id, false)).status).toBe("claimed");
    expect(await kinds(c.host)).toContain("deposit_return_disputed");
    await expect(respond(c.guest, c.id, true)).rejects.toThrow(/No hay una devolución pendiente/);

    expect((await markReturned(c.host, c.id, await day(-1))).return_response).toBeNull();
    expect((await respond(c.guest, c.id, true)).status).toBe("returned");
    expect(await events(c.id)).toEqual([
      "keys_declared", "keys_confirmed", "return_marked", "return_disputed", "return_marked", "return_confirmed",
    ]);
  });

  it("la devolución admite anotar el importe devuelto (informativo, nunca mayor que la fianza)", async () => {
    const c = await withKeys(10);
    await expect(markReturned(c.host, c.id, await day(-1), 321)).rejects.toThrow(/importe devuelto/);
    await expect(markReturned(c.host, c.id, await day(-1), -1)).rejects.toThrow(/importe devuelto/);
    const row = await markReturned(c.host, c.id, await day(-1), 270.5);
    expect(Number(row.returned_amount)).toBe(270.5);
    const seen = await run(c.guest, "select returned_amount from public.contract_deposits where contract_id = $1", [c.id]);
    expect(Number(seen.returned_amount)).toBe(270.5);
    expect(await kinds(c.guest)).toContain("deposit_return_marked");
    // Sin importe sigue valiendo.
    await respond(c.guest, c.id, false);
    expect((await markReturned(c.host, c.id, await day(-1))).returned_amount).toBeNull();
  });

  it("un depósito anotado se conserva en el estado al devolver; sin anotar vuelve a «pendiente»", async () => {
    const c = await withKeys(10);
    await record(c.host, c.id, await day(-20));
    await markReturned(c.host, c.id, await day(-1));
    expect((await deposit(c.id)).status).toBe("deposited");
    await expect(record(c.host, c.id, await day(-1), "OTRO")).rejects.toThrow(/ya consta como depositada/);
  });
});

describe("seguimiento de la fianza · cronología y borrado de cuenta", () => {
  it("la cronología no se modifica ni se borra, ni con service_role", async () => {
    const c = await contract();
    await record(c.host, c.id, await day(-1));
    await expect(db.query("update public.contract_deposit_events set kind = 'return_confirmed' where contract_id = $1", [c.id])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("delete from public.contract_deposit_events where contract_id = $1", [c.id])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("truncate public.contract_deposit_events")).rejects.toThrow(/no se puede modificar/);
    await expect(as(db, c.host, (tx) => tx.query("insert into public.contract_deposit_events (contract_id, kind) values ($1, 'return_confirmed')", [c.id]))).rejects.toThrow(/permission denied/);
  });

  it("borrar la cuenta de una parte conserva el seguimiento y su cronología", async () => {
    const c = await withKeys(10);
    await record(c.host, c.id, await day(-20), "RES-9");
    await as(db, c.guest, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    const row = await deposit(c.id);
    expect(row).toMatchObject({ status: "deposited", receipt_number: "RES-9" });
    expect(await events(c.id)).toEqual(["keys_declared", "keys_confirmed", "deposit_recorded"]);
    // La parte que queda sigue viéndolo.
    const seen = await as(db, c.host, async (tx) => (await tx.query("select status from public.contract_deposits where contract_id = $1", [c.id])).rows);
    expect(seen).toHaveLength(1);
  });
});
