import { z } from "zod";

import { findCity } from "@/lib/listings/cities";
import { formatShortDate, KIND_LABELS, LISTING_KINDS, PROVINCES } from "@/lib/listings/options";

/**
 * Filtros del listado /anuncios. Viven en la URL (searchParams): se pueden
 * compartir, enlazar, indexar y sobreviven a recargas y al botón Atrás.
 * Nombres de parámetro en español porque se ven en la barra de direcciones.
 */
/** Periodo en la URL (en español) → valor de listings.rental_term. */
export const PERIODS = { indefinido: "indefinite", curso: "academic_year", fechas: "fixed" } as const;
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

export type FilterChip = { key: string; label: string; removeHref: string };

const PERIOD_CHIP_LABELS = { curso: "Curso universitario", fechas: "Fechas concretas", indefinido: "Sin fecha de fin" } as const;
const SORT_CHIP_LABELS = { recientes: "Más recientes", precio_asc: "Precio: menor primero", precio_desc: "Precio: mayor primero" } as const;

/**
 * Filtros aplicados → chips que se quitan con un toque (cada uno es un enlace
 * a la misma búsqueda sin ese filtro y sin la página). El precio es un solo
 * chip. Sirven también de resumen del panel plegado.
 */
export function filterChips(f: ListingFilters): FilterChip[] {
  const without = (...keys: Array<keyof ListingFilters>) => {
    const next: ListingFilters = { ...f, pagina: undefined };
    for (const k of keys) delete next[k];
    return `/anuncios${serializeFilters(next)}`;
  };
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, ...remove: Array<keyof ListingFilters>) =>
    chips.push({ key, label, removeHref: without(...remove) });

  if (f.tipo) add("tipo", KIND_LABELS[f.tipo], "tipo");
  if (f.ciudad) add("ciudad", f.ciudad, "ciudad");
  if (f.provincia) add("provincia", f.provincia, "provincia");
  if (f.precio_min !== undefined || f.precio_max !== undefined) {
    const label =
      f.precio_min !== undefined && f.precio_max !== undefined
        ? `${f.precio_min}–${f.precio_max} €`
        : f.precio_max !== undefined
          ? `Hasta ${f.precio_max} €`
          : `Desde ${f.precio_min} €`;
    add("precio", label, "precio_min", "precio_max");
  }
  if (f.desde) add("desde", `Disponible el ${formatShortDate(f.desde)}`, "desde");
  if (f.periodo) add("periodo", PERIOD_CHIP_LABELS[f.periodo], "periodo");
  if (f.amueblado) add("amueblado", "Amueblado", "amueblado");
  if (f.gastos) add("gastos", "Gastos incluidos", "gastos");
  if (f.mascotas) add("mascotas", "Admite mascotas", "mascotas");
  if (f.fumadores) add("fumadores", "Se puede fumar", "fumadores");
  if (f.orden && f.orden !== "recientes") add("orden", SORT_CHIP_LABELS[f.orden], "orden");
  return chips;
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
