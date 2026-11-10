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
  start_date: "2027-09-01",
};

async function contract({ sign = true } = {}) {
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
      [listing, interest, host, guest, JSON.stringify(TERMS)],
    )).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("select public.send_contract($1, $2)", [id, TEXT]));
  if (sign) {
    await as(db, guest, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Bruno Inquilino Pérez", sha(TEXT)]));
    await as(db, host, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, "Ana Casera López", sha(TEXT)]));
  }
  return { host, guest, id };
}

const open = (user: string, contractId: string, stage: "entry" | "exit" = "entry") =>
  as(db, user, async (tx) =>
    (await tx.query<{ id: string }>("insert into public.contract_inventories (contract_id, stage) values ($1, $2) returning id", [contractId, stage])).rows[0].id,
  );
const addItem = (user: string, inventoryId: string, photos: string[] = []) =>
  as(db, user, async (tx) =>
    (await tx.query<{ id: string }>(
      "insert into public.inventory_items (inventory_id, area, name, condition, notes, photos) values ($1, 'Habitación', 'Colchón', 'good', 'Sin manchas', $2) returning id",
      [inventoryId, photos],
    )).rows[0].id,
  );
const confirm = (user: string, inventoryId: string) => as(db, user, (tx) => tx.query("select public.confirm_inventory($1)", [inventoryId]));
const inventory = async (id: string) =>
  (await db.query<{ landlord_confirmed_at: Date | null; tenant_confirmed_at: Date | null; locked_at: Date | null }>(
    "select * from public.contract_inventories where id = $1",
    [id],
  )).rows[0];

describe("inventario del contrato", () => {
  it("solo con el contrato firmado, y la salida solo con la entrada confirmada", async () => {
    const pending = await contract({ sign: false });
    await expect(open(pending.host, pending.id)).rejects.toThrow(/contrato ya firmado/);

    const c = await contract();
    await expect(open(c.guest, c.id, "exit")).rejects.toThrow(/Primero tenéis que confirmar/);
    const entry = await open(c.guest, c.id);
    await expect(open(c.host, c.id)).rejects.toThrow(/contract_inventories_one_per_stage/);
    await expect(confirm(c.host, entry)).rejects.toThrow(/al menos un elemento/);
    await addItem(c.guest, entry);
    await confirm(c.host, entry);
    await confirm(c.guest, entry);
    await expect(open(c.host, c.id, "exit")).resolves.toBeTruthy();
  });

  it("cambiar algo anula las confirmaciones; confirmado por los dos queda bloqueado para cualquiera", async () => {
    const c = await contract();
    const inv = await open(c.host, c.id);
    const item = await addItem(c.host, inv);
    await confirm(c.host, inv);
    expect((await inventory(inv)).landlord_confirmed_at).not.toBeNull();
    const n = await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [c.guest]);
    expect(n.rows.map((r) => r.kind)).toContain("inventory_to_confirm");

    // El inquilino corrige un estado: se anula la confirmación del casero.
    await as(db, c.guest, (tx) => tx.query("update public.inventory_items set condition = 'worn' where id = $1", [item]));
    expect((await inventory(inv)).landlord_confirmed_at).toBeNull();

    await confirm(c.guest, inv);
    await expect(confirm(c.guest, inv)).rejects.toThrow(/Ya has confirmado/);
    await confirm(c.host, inv);
    expect((await inventory(inv)).locked_at).not.toBeNull();

    // Bloqueado: ni las partes ni service_role lo cambian.
    await expect(as(db, c.guest, (tx) => tx.query("update public.inventory_items set notes = 'otra cosa' where id = $1", [item]))).rejects.toThrow(
      /no se puede modificar/,
    );
    await expect(as(db, c.host, (tx) => tx.query("delete from public.inventory_items where id = $1", [item]))).rejects.toThrow(/no se puede modificar/);
    await expect(addItem(c.host, inv)).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("update public.inventory_items set notes = 'admin' where id = $1", [item])).rejects.toThrow(/no se puede modificar/);
    await expect(db.query("delete from public.contract_inventories where id = $1", [inv])).rejects.toThrow(/no se puede modificar/);
  });

  it("terceros no lo ven ni lo tocan; las fotos van en la carpeta del inventario", async () => {
    const c = await contract();
    const stranger = await createUser(db, "Extraña Inventario");
    const inv = await open(c.host, c.id);
    const item = await addItem(c.host, inv);
    await as(db, stranger, async (tx) => {
      expect((await tx.query("select * from public.contract_inventories where id = $1", [inv])).rows).toEqual([]);
      expect((await tx.query("select * from public.inventory_items where id = $1", [item])).rows).toEqual([]);
      expect((await tx.query("update public.inventory_items set notes = 'x' where id = $1", [item])).affectedRows).toBe(0);
      expect((await tx.query("delete from public.inventory_items where id = $1", [item])).affectedRows).toBe(0);
    });
    await expect(addItem(stranger, inv)).rejects.toThrow(/row-level security/);
    await expect(open(stranger, c.id, "exit")).rejects.toThrow(/no encontrado/);
    await expect(confirm(stranger, inv)).rejects.toThrow(/no encontrado/);
    // Nadie se confirma a sí mismo cambiando columnas a mano.
    await expect(as(db, c.host, (tx) => tx.query("update public.contract_inventories set locked_at = now() where id = $1", [inv]))).rejects.toThrow(
      /permission denied/,
    );

    const good = `${c.id}/${inv}/${randomUUID()}.webp`;
    await expect(addItem(c.guest, inv, [good])).resolves.toBeTruthy();
    await expect(addItem(c.guest, inv, [`${c.guest}/x/${randomUUID()}.webp`])).rejects.toThrow(/Foto no válida/);
    await expect(addItem(c.guest, inv, ["https://example.com/foto.webp"])).rejects.toThrow(/Foto no válida/);
  });

  it("storage: solo las partes leen y suben fotos, y no con el inventario bloqueado", async () => {
    const c = await contract();
    const stranger = await createUser(db, "Extraño Fotos");
    const inv = await open(c.host, c.id);
    const name = `${c.id}/${inv}/${randomUUID()}.webp`;
    const put = (user: string | null, n: string) =>
      as(db, user, (tx) => tx.query("insert into storage.objects (bucket_id, name, owner) values ('inventory-photos', $1, $2)", [n, user]));

    await put(c.guest, name);
    expect((await as(db, c.host, (tx) => tx.query("select name from storage.objects where name = $1", [name]))).rows).toHaveLength(1);
    expect((await as(db, stranger, (tx) => tx.query("select name from storage.objects where name = $1", [name]))).rows).toEqual([]);
    expect((await as(db, null, (tx) => tx.query("select name from storage.objects where name = $1", [name]))).rows).toEqual([]);
    await expect(put(stranger, `${c.id}/${inv}/${randomUUID()}.webp`)).rejects.toThrow(/row-level security/);
    await expect(put(c.guest, `${c.id}/${inv}/sin-uuid.webp`)).rejects.toThrow(/row-level security/);
    expect((await as(db, stranger, (tx) => tx.query("delete from storage.objects where name = $1", [name]))).affectedRows).toBe(0);

    await addItem(c.host, inv, [name]);
    await confirm(c.host, inv);
    await confirm(c.guest, inv);
    await expect(put(c.guest, `${c.id}/${inv}/${randomUUID()}.webp`)).rejects.toThrow(/row-level security/);
    expect((await as(db, c.guest, (tx) => tx.query("delete from storage.objects where name = $1", [name]))).affectedRows).toBe(0);
  });

  it("borrar la cuenta de una parte conserva el inventario confirmado", async () => {
    const c = await contract();
    const inv = await open(c.host, c.id);
    await addItem(c.host, inv);
    await confirm(c.host, inv);
    await confirm(c.guest, inv);
    await as(db, c.guest, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    expect((await inventory(inv)).locked_at).not.toBeNull();
    const items = await db.query("select * from public.inventory_items where inventory_id = $1", [inv]);
    expect(items.rows).toHaveLength(1);
  });
});
