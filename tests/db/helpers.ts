import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

export type Db = PGlite;
export type Tx = Transaction;

/** Postgres en memoria con el shim de Supabase y todas las migraciones aplicadas. */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Fallo aplicando ${file}: ${(error as Error).message}`);
    }
  }
  if (options.seed) {
    await db.exec(readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8"));
  }
  return db;
}

/**
 * Ejecuta `fn` como lo haría la API de Supabase para ese usuario:
 * rol `authenticated` (o `anon` si userId es null) y claims del JWT.
 * Todo va en una transacción; si `fn` lanza, se revierte.
 */
export async function as<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}

/** Crea un usuario en auth.users (el trigger crea su perfil). */
export async function createUser(db: Db, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), $1, now(), jsonb_build_object('display_name', $2::text), now(), now())
     returning id`,
    [`${name.toLowerCase().replace(/\W+/g, ".")}.${Math.random().toString(36).slice(2, 8)}@example.com`, name],
  );
  return rows[0].id;
}

/** Inserta como sistema (sin JWT) y devuelve la primera fila. */
export async function sysInsert<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}
