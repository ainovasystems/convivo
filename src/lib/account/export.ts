import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Copia de los datos de una persona (derecho de acceso y portabilidad, arts. 15
 * y 20 RGPD). Se lee con SU sesión, así que RLS garantiza que solo sale lo que
 * ya puede ver: nada de otras personas salvo lo imprescindible para entender
 * sus conversaciones y reseñas (ids).
 */
export async function buildDataExport(supabase: SupabaseClient<Database>, user: { id: string; email: string | null }) {
  const uid = user.id;
  const [profile, listings, interests, messages, stays, participations, written, received, notifications, blocks, reports, contracts, inventories, inventoryItems] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("listings").select("*, address:listing_addresses(address_line, floor_door, postal_code)").eq("owner_id", uid),
      supabase.from("interests").select("id, listing_id, from_user, status, message, created_at, updated_at"),
      supabase.from("messages").select("id, interest_id, body, created_at").eq("sender_id", uid),
      supabase.from("stays").select("*").or(`host_id.eq.${uid},guest_id.eq.${uid}`),
      supabase.from("stay_participants").select("*").eq("user_id", uid),
      supabase.from("reviews").select("*").eq("author_id", uid),
      supabase.from("reviews").select("*").eq("subject_user_id", uid).lte("published_at", new Date().toISOString()),
      supabase.from("notifications").select("*").eq("user_id", uid),
      supabase.from("blocks").select("*").eq("blocker_id", uid),
      supabase.from("reports").select("id, reason, details, status, created_at, target_listing_id, target_user_id, target_review_id").eq("reporter_id", uid),
      supabase
        .from("contracts")
        .select("id, kind, status, template_version, terms, document_text, document_hash, sent_at, landlord_signed_at, landlord_signature, tenant_signed_at, tenant_signature, signed_at, cancelled_at, landlord_id, tenant_id, listing_id, stay_id, created_at")
        .or(`landlord_id.eq.${uid},tenant_id.eq.${uid}`),
      supabase.from("contract_inventories").select("*"),
      supabase.from("inventory_items").select("id, inventory_id, area, name, condition, notes, photos, created_by, created_at"),
    ]);

  return {
    generado: new Date().toISOString(),
    nota:
      "Copia de tus datos en Convivo. Incluye tu perfil, tus anuncios con su dirección, tus conversaciones (tus mensajes), " +
      "tus estancias, tus contratos con sus inventarios (las fotos se descargan desde cada inventario), las reseñas que has escrito y las ya publicadas sobre ti. No incluye datos de otras personas.",
    cuenta: { id: uid, email: user.email },
    perfil: profile.data,
    anuncios: listings.data ?? [],
    intereses: interests.data ?? [],
    mis_mensajes: messages.data ?? [],
    estancias: stays.data ?? [],
    participaciones_como_companero: participations.data ?? [],
    resenas_escritas: written.data ?? [],
    resenas_recibidas_publicadas: received.data ?? [],
    avisos: notifications.data ?? [],
    bloqueos: blocks.data ?? [],
    denuncias_hechas: reports.data ?? [],
    contratos: contracts.data ?? [],
    inventarios: inventories.data ?? [],
    elementos_de_inventario: inventoryItems.data ?? [],
  };
}
