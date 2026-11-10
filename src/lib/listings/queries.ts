import "server-only";

import { applyListingFilters, escapeLike, type FilterableQuery, type ListingFilters } from "@/lib/listings/filters";
import type { RuleKey } from "@/lib/listings/options";
import { createClient } from "@/lib/supabase/server";

export const CARD_COLUMNS =
  "id, kind, title, city, province, neighborhood, monthly_rent, max_budget, available_from, move_in_date, rental_term, available_until, cohabitation, furnished, bills_included, photos, published_at";

export async function searchListings(filters: ListingFilters) {
  const supabase = await createClient();
  const base = supabase.from("listings").select(CARD_COLUMNS, { count: "exact" });
  // El builder de Supabase cumple la interfaz mínima de FilterableQuery.
  const query = applyListingFilters(base as unknown as FilterableQuery<typeof base>, filters) as unknown as typeof base;
  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export type ListingCardData = Awaited<ReturnType<typeof searchListings>>["items"][number];

export async function getListingDetail(id: string) {
  const supabase = await createClient();
  const { data: listing, error } = await supabase
    .from("listings")
    .select("*, owner:profiles!listings_owner_id_fkey(id, display_name, avatar_path, city, occupation, email_verified, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!listing) return null;

  const [address, stats, reviews, ownerStats] = await Promise.all([
    // RLS: solo devuelve fila al dueño y a interesados aceptados.
    supabase.from("listing_addresses").select("address_line, floor_door, postal_code").eq("listing_id", id).maybeSingle(),
    supabase.rpc("listing_review_stats", { p_listing_id: id }),
    supabase
      .from("reviews")
      .select(
        "id, relationship, rating, criteria, body, published_at, deleted_at, deletion_reason, author:profiles!reviews_author_id_fkey(id, display_name, avatar_path), response:review_responses(body, created_at)",
      )
      .eq("subject_type", "listing")
      .eq("subject_listing_id", id)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(50),
    supabase.rpc("profile_review_stats", { p_user_id: listing.owner_id }),
  ]);

  return {
    listing: { ...listing, rules: (listing.rules ?? {}) as Partial<Record<RuleKey, boolean>> },
    address: address.data ?? null,
    stats: stats.data?.[0] && Number(stats.data[0].review_count) > 0 ? stats.data[0] : null,
    reviews: (reviews.data ?? []).map((r) => ({ ...r, criteria: (r.criteria ?? null) as Record<string, number> | null })),
    ownerStats: (ownerStats.data ?? []).map((r) => ({
      relationship: r.relationship,
      review_count: Number(r.review_count),
      avg_rating: Number(r.avg_rating),
    })),
  };
}

export async function getMyListings(ownerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(`${CARD_COLUMNS}, status, updated_at`)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getOwnListingForEdit(id: string, ownerId: string) {
  const supabase = await createClient();
  const [{ data: listing, error }, { data: address }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle(),
    supabase.from("listing_addresses").select("address_line, floor_door, postal_code").eq("listing_id", id).maybeSingle(),
  ]);
  if (error) throw error;
  if (!listing) return null;
  return { listing, address };
}

/** Anuncios por página de ciudad (SEO): los más recientes; el resto, en la búsqueda. */
export const CITY_PAGE_LIMIT = 24;

/**
 * Datos de una página pública de ciudad: anuncios activos de un tipo en una
 * ciudad (nombre exacto, sin comodines), cuántos hay, el precio mínimo y
 * cuántas personas buscan en esa ciudad. Solo columnas públicas.
 */
export async function getCityPageData(city: string, kind: "room" | "flat") {
  const supabase = await createClient();
  const exact = escapeLike(city);
  const [list, cheapest, seeking] = await Promise.all([
    supabase
      .from("listings")
      .select(CARD_COLUMNS, { count: "exact" })
      .eq("status", "active")
      .eq("kind", kind)
      .ilike("city", exact)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(CITY_PAGE_LIMIT),
    supabase
      .from("listings")
      .select("monthly_rent")
      .eq("status", "active")
      .eq("kind", kind)
      .ilike("city", exact)
      .not("monthly_rent", "is", null)
      .order("monthly_rent", { ascending: true })
      .limit(1),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("kind", "seeking")
      .ilike("city", exact),
  ]);
  if (list.error) throw list.error;
  return {
    items: list.data ?? [],
    total: list.count ?? 0,
    minPrice: cheapest.data?.[0]?.monthly_rent ?? null,
    seekingCount: seeking.count ?? 0,
  };
}

/** Anuncios activos para el sitemap (id y última modificación). Sin «busco»: son personas. */
export async function getSitemapListings(limit = 5000) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id, updated_at")
    .eq("status", "active")
    .neq("kind", "seeking")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
