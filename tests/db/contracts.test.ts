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
  start_date: "2027-09-01",
  end_date: "2028-06-30",
};

async function world() {
  const host = await createUser(db, "Ana Casera");
  const guest = await createUser(db, "Bruno Inquilino");
  const listing = (await createActiveListing(db, host)).id;
  const interest = await as(db, guest, async (tx) =>
    (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [listing, guest, MSG])).rows[0].id,
  );
  await as(db, host, (tx) => tx.query("update public.interests set status = 'accepted' where id = $1", [interest]));
  return { host, guest, listing, interest };
}

async function draft(w: Awaited<ReturnType<typeof world>>, terms: Record<string, unknown> = TERMS) {
  return as(db, w.host, async (tx) =>
    (await tx.query<{ id: string; status: string }>(
      `insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms)
       values ($1, $2, $3, $4, 'room', 'v1', $5) returning id, status`,
      [w.listing, w.interest, w.host, w.guest, JSON.stringify(terms)],
    )).rows[0],
  );
}
const send = (user: string, id: string, text = TEXT) => as(db, user, (tx) => tx.query("select public.send_contract($1, $2)", [id, text]));
const sign = (user: string, id: string, name: string, hash = sha(TEXT)) =>
  as(db, user, (tx) => tx.query("select public.sign_contract($1, $2, $3)", [id, name, hash]));
const contract = async (id: string) =>
  (await db.query<{ status: string; stay_id: string | null; document_hash: string | null }>("select * from public.contracts where id = $1", [id])).rows[0];

describe("contratos", () => {
  it("flujo completo: borrador, envío, firma de los dos y estancia confirmada", async () => {
    const w = await world();
    const c = await draft(w);
    expect(c.status).toBe("draft");

    // El borrador se edita; enviado ya no.
    await as(db, w.host, (tx) => tx.query("update public.contracts set terms = terms || '{\"monthly_rent\": 330}' where id = $1", [c.id]));
    await send(w.host, c.id);
    expect((await contract(c.id)).document_hash).toBe(sha(TEXT));
    await expect(
      as(db, w.host, (tx) => tx.query("update public.contracts set terms = terms || '{\"monthly_rent\": 999}' where id = $1", [c.id])),
    ).rejects.toThrow(/ya se ha enviado/);

    // El inquilino recibe el aviso.
    const n = await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [w.guest]);
    expect(n.rows.map((r) => r.kind)).toContain("contract_to_sign");

    // Firma con el nombre exacto (sin importar mayúsculas ni espacios) y el hash del texto leído.
    await expect(sign(w.guest, c.id, "Bruno Otro")).rejects.toThrow(/nombre completo tal como aparece/);
    await expect(sign(w.guest, c.id, "Bruno Inquilino Pérez", sha("otro texto"))).rejects.toThrow(/no coincide/);
    await sign(w.guest, c.id, "  bruno   inquilino pérez ");
    await expect(sign(w.guest, c.id, "Bruno Inquilino Pérez")).rejects.toThrow(/Ya has firmado/);
    expect((await contract(c.id)).status).toBe("sent");

    await sign(w.host, c.id, "Ana Casera López");
    const done = await contract(c.id);
    expect(done.status).toBe("signed");
    const stay = await db.query<{ status: string; host_confirmed_at: Date | null; guest_confirmed_at: Date | null; start_date: string }>(
      "select status, host_confirmed_at, guest_confirmed_at, start_date::text from public.stays where id = $1",
      [done.stay_id],
    );
    expect(stay.rows[0]).toMatchObject({ status: "active", start_date: "2027-09-01" });
    expect(stay.rows[0].host_confirmed_at).not.toBeNull();
    expect(stay.rows[0].guest_confirmed_at).not.toBeNull();

    // Firmado: inmutable para cualquiera, también service_role.
    await expect(
      db.query("update public.contracts set document_text = 'cambiado' where id = $1", [c.id]),
    ).rejects.toThrow(/firmado o cancelado/);
    await expect(as(db, w.host, (tx) => tx.query("select public.cancel_contract($1)", [c.id]))).rejects.toThrow(/no se puede cancelar/);
  });

  it("solo el anunciante, con interés aceptado y con la persona interesada", async () => {
    const w = await world();
    const stranger = await createUser(db, "Extraña Contratos");
    // El inquilino no puede crearlo en nombre del casero, ni el casero con otro inquilino.
    await expect(
      as(db, w.guest, (tx) =>
        tx.query(
          "insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms) values ($1, $2, $3, $4, 'room', 'v1', '{}')",
          [w.listing, w.interest, w.host, w.guest],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, w.host, (tx) =>
        tx.query(
          "insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms) values ($1, $2, $3, $4, 'room', 'v1', '{}')",
          [w.listing, w.interest, w.host, stranger],
        ),
      ),
    ).rejects.toThrow(/entre el anunciante y la persona interesada/);
    // Con el interés pendiente, no.
    const other = await createUser(db, "Pendiente Contrato");
    const pending = await as(db, other, async (tx) =>
      (await tx.query<{ id: string }>("insert into public.interests (listing_id, from_user, message) values ($1, $2, $3) returning id", [w.listing, other, MSG])).rows[0].id,
    );
    await expect(
      as(db, w.host, (tx) =>
        tx.query(
          "insert into public.contracts (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms) values ($1, $2, $3, $4, 'room', 'v1', '{}')",
          [w.listing, pending, w.host, other],
        ),
      ),
    ).rejects.toThrow(/interés está aceptado/);
    // Un piso entero no se contrata como habitación.
    // Terceros no lo ven ni lo firman.
    const c = await draft(w);
    await send(w.host, c.id);
    expect((await as(db, stranger, (tx) => tx.query("select * from public.contracts where id = $1", [c.id]))).rows).toEqual([]);
    await expect(sign(stranger, c.id, "Extraña Contratos")).rejects.toThrow(/no encontrado/);
    // Un solo contrato vivo por conversación.
    await expect(draft(w)).rejects.toThrow(/contracts_one_open_per_interest/);
  });

  it("si ya había una estancia propuesta en el chat, el contrato la confirma en vez de duplicarla", async () => {
    const w = await world();
    const proposed = await as(db, w.guest, async (tx) =>
      (await tx.query<{ id: string }>(
        "insert into public.stays (listing_id, interest_id, host_id, guest_id, start_date) values ($1, $2, $3, $4, '2027-09-01') returning id",
        [w.listing, w.interest, w.host, w.guest],
      )).rows[0].id,
    );
    const c = await draft(w);
    await send(w.host, c.id);
    await sign(w.guest, c.id, "Bruno Inquilino Pérez");
    await sign(w.host, c.id, "Ana Casera López");
    expect((await contract(c.id)).stay_id).toBe(proposed);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.stays where listing_id = $1 and guest_id = $2", [w.listing, w.guest]);
    expect(rows[0].n).toBe(1);
  });

  it("se cancela antes de firmar y avisa a la otra parte; un borrador se puede borrar", async () => {
    const w = await world();
    const d = await draft(w);
    expect((await as(db, w.host, (tx) => tx.query("delete from public.contracts where id = $1", [d.id]))).affectedRows).toBe(1);
    const c = await draft(w);
    await send(w.host, c.id);
    await expect(as(db, w.host, (tx) => tx.query("delete from public.contracts where id = $1", [c.id]))).resolves.toMatchObject({
      affectedRows: 0,
    });
    await as(db, w.guest, (tx) => tx.query("select public.cancel_contract($1)", [c.id]));
    expect((await contract(c.id)).status).toBe("cancelled");
    const n = await db.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [w.host]);
    expect(n.rows.map((r) => r.kind)).toContain("contract_cancelled");
    await expect(sign(w.guest, c.id, "Bruno Inquilino Pérez")).rejects.toThrow(/no está pendiente de firma/);
  });

  it("borrar la cuenta conserva los contratos firmados y cancela los pendientes", async () => {
    const w = await world();
    const c = await draft(w);
    await send(w.host, c.id);
    await sign(w.guest, c.id, "Bruno Inquilino Pérez");
    await sign(w.host, c.id, "Ana Casera López");
    const w2 = await world();
    const pending = await draft(w2);
    await send(w2.host, pending.id);

    await as(db, w.guest, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    await as(db, w2.guest, (tx) => tx.query("select public.delete_my_account('BORRAR')"));
    const signed = await db.query<{ status: string; document_text: string; interest_id: string | null }>(
      "select status, document_text, interest_id from public.contracts where id = $1",
      [c.id],
    );
    expect(signed.rows[0]).toMatchObject({ status: "signed", document_text: TEXT, interest_id: null });
    expect((await contract(pending.id)).status).toBe("cancelled");
  });
});
