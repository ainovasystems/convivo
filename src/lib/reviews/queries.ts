import "server-only";

import { RELATIONSHIP_TITLES, reviewTargets, type ReviewTarget } from "@/lib/reviews/targets";
import { createClient } from "@/lib/supabase/server";

export type ReviewTask = ReviewTarget & {
  stayId: string;
  subjectName: string;
  title: string;
  closesAt: string;
};

/**
 * Lo que el usuario puede reseñar ahora: estancias con la ventana abierta y
 * sujetos que aún no ha reseñado. La BD vuelve a validarlo al insertar.
 */
export async function getMyReviewTasks(userId: string) {
  const supabase = await createClient();
  const { data: stays, error } = await supabase
    .from("stays")
    .select(
      "id, host_id, guest_id, listing_id, status, listing:listings!stays_listing_id_fkey(title), host:profiles!stays_host_id_fkey(display_name), guest:profiles!stays_guest_id_fkey(display_name), stay_participants(user_id, confirmed_at, profile:profiles!stay_participants_user_id_fkey(display_name))",
    )
    .in("status", ["active", "ended"]);
  if (error) throw error;

  const { data: mine } = await supabase
    .from("reviews")
    .select("stay_id, subject_listing_id, subject_user_id")
    .eq("author_id", userId);
  const done = new Set((mine ?? []).map((r) => `${r.stay_id}:${r.subject_listing_id ?? r.subject_user_id}`));

  const open: ReviewTask[] = [];
  const upcoming: Array<{ stayId: string; listingTitle: string; opensAt: string }> = [];

  for (const s of stays ?? []) {
    const { data: win } = await supabase.rpc("get_review_window", { p_stay_id: s.id });
    const w = win?.[0];
    if (!w?.opens_at) continue;

    const confirmed = s.stay_participants.filter((p) => p.confirmed_at).map((p) => p.user_id);
    const targets = reviewTargets({ ...s, confirmedParticipants: confirmed }, userId).filter(
      (t) => !done.has(`${s.id}:${t.subjectId}`),
    );
    if (!targets.length) continue;

    if (!w.is_open) {
      if (new Date(w.opens_at) > new Date()) upcoming.push({ stayId: s.id, listingTitle: s.listing?.title ?? "", opensAt: w.opens_at });
      continue;
    }

    const nameOf = (id: string) =>
      id === s.host_id
        ? s.host?.display_name
        : id === s.guest_id
          ? s.guest?.display_name
          : s.stay_participants.find((p) => p.user_id === id)?.profile?.display_name;

    for (const t of targets) {
      open.push({
        ...t,
        stayId: s.id,
        subjectName: t.subjectType === "listing" ? (s.listing?.title ?? "El inmueble") : (nameOf(t.subjectId) ?? "Usuario"),
        title: RELATIONSHIP_TITLES[t.relationship],
        closesAt: w.closes_at!,
      });
    }
  }
  return { open, upcoming };
}

/** Reseñas que he escrito, con su estado de publicación. */
export async function getMyWrittenReviews(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, relationship, rating, body, created_at, published_at, deleted_at, deletion_reason, subject_user:profiles!reviews_subject_user_id_fkey(id, display_name), subject_listing:listings!reviews_subject_listing_id_fkey(id, title)",
    )
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMyNotifications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

/** Datos para el formulario de reseña; null si no se puede reseñar. */
export async function getReviewFormContext(userId: string, stayId: string, subjectId: string) {
  const { open } = await getMyReviewTasks(userId);
  return open.find((t) => t.stayId === stayId && t.subjectId === subjectId) ?? null;
}
