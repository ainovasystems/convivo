import "server-only";

import { createClient } from "@/lib/supabase/server";

const INTEREST_COLUMNS =
  "id, status, message, created_at, decided_at, from_user, listing:listings!interests_listing_id_fkey(id, title, kind, city, province, owner_id, owner:profiles!listings_owner_id_fkey(id, display_name, avatar_path)), guest:profiles!interests_from_user_fkey(id, display_name, avatar_path)";

/** Total de mensajes sin leer (para el contador de la cabecera). */
export async function getUnreadTotal(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unread_counts");
  return (data ?? []).reduce((n, r) => n + Number(r.unread), 0);
}

/** Conversaciones en las que participo (RLS ya limita a las mías). */
export async function listConversations() {
  const supabase = await createClient();
  const [{ data, error }, { data: unread }] = await Promise.all([
    supabase.from("interests").select(INTEREST_COLUMNS).order("updated_at", { ascending: false }).limit(200),
    supabase.rpc("my_unread_counts"),
  ]);
  if (error) throw error;
  const ids = (data ?? []).map((i) => i.id);
  const { data: last } = ids.length
    ? await supabase
        .from("messages")
        .select("interest_id, body, created_at")
        .in("interest_id", ids)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const lastByInterest = new Map<string, { body: string; created_at: string }>();
  for (const m of last ?? []) if (!lastByInterest.has(m.interest_id)) lastByInterest.set(m.interest_id, m);
  const unreadBy = new Map((unread ?? []).map((u) => [u.interest_id, Number(u.unread)]));

  return (data ?? [])
    .map((i) => ({
      ...i,
      lastMessage: lastByInterest.get(i.id) ?? null,
      unread: unreadBy.get(i.id) ?? 0,
      sortKey: lastByInterest.get(i.id)?.created_at ?? i.created_at,
    }))
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export async function getConversation(interestId: string) {
  const supabase = await createClient();
  const { data: interest, error } = await supabase.from("interests").select(INTEREST_COLUMNS).eq("id", interestId).maybeSingle();
  if (error) throw error;
  if (!interest) return null;

  const [messages, stays] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("interest_id", interestId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("stays")
      .select(
        "id, status, start_date, end_date, host_id, guest_id, proposed_by, host_confirmed_at, guest_confirmed_at, stay_participants(user_id, confirmed_at, profile:profiles!stay_participants_user_id_fkey(id, display_name))",
      )
      .eq("interest_id", interestId)
      .order("created_at", { ascending: false }),
  ]);
  return { interest, messages: messages.data ?? [], stays: stays.data ?? [] };
}

export type Conversation = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

/** Mi interés (si existe) en un anuncio, para la ficha. */
export async function getMyInterestForListing(listingId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("interests")
    .select("id, status")
    .eq("listing_id", listingId)
    .eq("from_user", userId)
    .maybeSingle();
  return data;
}

/** Estancias en las que participo (como host, guest o compañero). */
export async function getMyStays() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stays")
    .select(
      "id, status, start_date, end_date, host_id, guest_id, interest_id, is_retroactive, host_confirmed_at, guest_confirmed_at, listing:listings!stays_listing_id_fkey(id, title, city), host:profiles!stays_host_id_fkey(id, display_name), guest:profiles!stays_guest_id_fkey(id, display_name), stay_participants(user_id, confirmed_at)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
