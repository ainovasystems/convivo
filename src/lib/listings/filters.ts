import { z } from "zod";

import { findCity } from "@/lib/listings/cities";
import { LISTING_KINDS, PROVINCES } from "@/lib/listings/options";

/**
 * Filtros del listado /anuncios. Viven en la URL (searchParams): se pueden
 * compartir, enlazar, indexar y sobreviven a recargas y al botón Atrás.
 * Nombres de parámetro en español porque se ven en la barra de direcciones.
 */
/** Periodo en la URL (en español) → valor de listings.rental_term. */
export const PERIODS = { indefinido: "indefinite", curso: "academic_year", fechas: "fixed" } as const;
/** Convivencia en la URL → valores de listings.cohabitation que encajan. */
export const COHABITATION_FILTERS = { chicas: ["women", "any"], chicos: ["men", "any"] } as const;
export const SORTS = ["recientes", "precio_asc", "precio_desc"] as const;
export const PAGE_SIZE = 12;

const flag = z
  .enum(["1", "true", "si"])
  .optional()
  .catch(undefined)
  .transform((v) => (v ? true : undefined));
const money = z.coerce.number().int().min(0).max(100000).optional().catch(undefined);

export const filtersSchema = z.object({
  tipo: z.enum(LISTING_KINDS).optional().catch(undefined),
  provincia: z.enum(PROVINCES).optional().catch(undefined),
  ciudad: z.string().trim().max(80).optional().catch(undefined).transform((v) => v || undefined),
  precio_min: money,
  precio_max: money,
  desde: z.iso.date().optional().catch(undefined),
  periodo: z.enum(Object.keys(PERIODS) as [keyof typeof PERIODS]).optional().catch(undefined),
  convivencia: z.enum(["chicas", "chicos"]).optional().catch(undefined),
  amueblado: flag,
  gastos: flag,
  mascotas: flag,
  fumadores: flag,
  orden: z.enum(SORTS).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

/** Todos los filtros son opcionales. */
export type ListingFilters = Partial<z.infer<typeof filtersSchema>>;

type RawParams = Record<string, string | string[] | undefined>;

/** searchParams -> filtros válidos. Los valores inválidos se ignoran (nunca rompe). */
export function parseFilters(params: RawParams): ListingFilters {
  const single = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== ""),
  );
  const f = filtersSchema.parse(single);
  // Una ciudad conocida fija su provincia: "Lugo" + "Madrid" no tiene sentido.
  const known = findCity(f.ciudad);
  if (known && f.provincia) f.provincia = known.province;
  return f;
}

/** Filtros -> query string canónica (sin valores vacíos ni página 1). */
export function serializeFilters(f: ListingFilters): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "pagina" && value === 1) continue;
    if (key === "orden" && value === "recientes") continue;
    sp.set(key, value === true ? "1" : String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Interfaz mínima del query builder de Supabase que usamos (facilita los tests). */
export interface FilterableQuery<Q> {
  eq(column: string, value: unknown): Q;
  ilike(column: string, pattern: string): Q;
  in(column: string, values: readonly unknown[]): Q;
  gte(column: string, value: unknown): Q;
  lte(column: string, value: unknown): Q;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Q;
  range(from: number, to: number): Q;
}

/** Escapa los comodines de LIKE para que el texto del usuario sea literal. */
export function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Aplica los filtros a una consulta sobre public.listings. Solo anuncios
 * activos. El rango de precio usa monthly_rent; con tipo "seeking", el
 * presupuesto máximo (max_budget).
 */
export function applyListingFilters<Q extends FilterableQuery<Q>>(query: Q, f: ListingFilters): Q {
  let q = query.eq("status", "active");
  if (f.tipo) q = q.eq("kind", f.tipo);
  if (f.provincia) q = q.eq("province", f.provincia);
  if (f.ciudad) q = q.ilike("city", `%${escapeLike(f.ciudad)}%`);

  const priceColumn = f.tipo === "seeking" ? "max_budget" : "monthly_rent";
  if (f.precio_min !== undefined) q = q.gte(priceColumn, f.precio_min);
  if (f.precio_max !== undefined) q = q.lte(priceColumn, f.precio_max);

  if (f.desde && f.tipo !== "seeking") q = q.lte("available_from", f.desde);
  if (f.periodo) q = q.eq("rental_term", PERIODS[f.periodo]);
  // «Soy chica»: anuncios solo para chicas o indiferentes (los pisos enteros siempre lo son).
  if (f.convivencia) q = q.in("cohabitation", COHABITATION_FILTERS[f.convivencia]);
  if (f.amueblado) q = q.eq("furnished", true);
  if (f.gastos) q = q.eq("bills_included", true);
  if (f.mascotas) q = q.eq("rules->>pets", "true");
  if (f.fumadores) q = q.eq("rules->>smoking", "true");

  switch (f.orden) {
    case "precio_asc":
      q = q.order(priceColumn, { ascending: true, nullsFirst: false });
      break;
    case "precio_desc":
      q = q.order(priceColumn, { ascending: false, nullsFirst: false });
      break;
    default:
      q = q.order("published_at", { ascending: false, nullsFirst: false });
  }
  // Desempate estable para que la paginación no repita ni salte anuncios.
  q = q.order("id", { ascending: true });

  const page = f.pagina ?? 1;
  return q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
}
