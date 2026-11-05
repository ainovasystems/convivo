// Genera supabase/instalar-base-de-datos.sql: todas las migraciones en orden,
// en un solo fichero para pegarlo de una vez en el editor SQL de Supabase.
// Uso: npm run db:bundle
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
export function buildBundle() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const header = [
    "-- =============================================================================",
    "-- CONVIVO · Instalación completa de la base de datos (proyecto NUEVO de Supabase)",
    "-- Generado con `npm run db:bundle` a partir de supabase/migrations/. No lo edites a mano.",
    "-- Pégalo entero en Supabase → SQL Editor → New query → Run. Solo una vez.",
    "-- =============================================================================",
    "",
  ].join("\n");
  return header + files.map((f) => `\n-- >>> ${f}\n${readFileSync(join(dir, f), "utf8")}`).join("\n");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  writeFileSync(join(dir, "..", "instalar-base-de-datos.sql"), buildBundle());
  console.log("supabase/instalar-base-de-datos.sql generado");
}
