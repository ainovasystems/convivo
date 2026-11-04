import "server-only";

import { z } from "zod";

import type { Habits } from "@/lib/profile/options";
import type { ReviewRelationship } from "@/lib/reviews/labels";
import { createClient } from "@/lib/supabase/server";

export const profileIdSchema = z.uuid();

const PUBLIC_PROFILE_COLUMNS =
  "id, display_name, bio, avatar_path, city, occupation, age_range, languages, habits, roles, email_verified, phone_verified, created_at";

export async function getProfile(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, habits: data.habits as Habits } : null;
}

export type ProfileStats = {
  relationship: ReviewRelationship;
  review_count: number;
  avg_rating: number;
  criteria_avg: Record<string, number>;
};

export async function getProfileStats(id: string): Promise<ProfileStats[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_review_stats", { p_user_id: id });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    relationship: r.relationship,
    review_count: Number(r.review_count),
    avg_rating: Number(r.avg_rating),
    criteria_avg: (r.criteria_avg ?? {}) as Record<string, number>,
  }));
}

/**
 * Reseñas PUBLICADAS recibidas por un usuario. Se filtra explícitamente por
 * published_at aunque RLS ya lo hace para terceros: así el autor de una
 * reseña pendiente no la ve mezclada en el perfil público de otro.
 */
export async function getReceivedReviews(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, relationship, rating, criteria, body, published_at, deleted_at, deletion_reason, author:profiles!reviews_author_id_fkey(id, display_name, avatar_path)",
    )
    .eq("subject_type", "user")
    .eq("subject_user_id", id)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, criteria: (r.criteria ?? null) as Record<string, number> | null }));
}

export type ReceivedReview = Awaited<ReturnType<typeof getReceivedReviews>>[number];

export async function getActiveListingsByOwner(ownerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id, kind, title, city, neighborhood, monthly_rent, max_budget")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
