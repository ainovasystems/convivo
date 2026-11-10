import "server-only";

import { contractTermsSchema, suggestedKind, type ContractKind, type ContractTerms } from "@/lib/contracts/schema";
import { RULE_KEYS, RULE_LABELS, type RuleKey } from "@/lib/listings/options";
import { createClient } from "@/lib/supabase/server";

const CONTRACT_COLUMNS =
  "id, listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms, status, document_text, document_hash, sent_at, landlord_signed_at, landlord_signature, tenant_signed_at, tenant_signature, signed_at, cancelled_at, stay_id, created_at, listing:listings!contracts_listing_id_fkey(id, title, city), landlord:profiles!contracts_landlord_id_fkey(id, display_name), tenant:profiles!contracts_tenant_id_fkey(id, display_name)";

export async function getContract(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select(CONTRACT_COLUMNS).eq("id", id).maybeSingle();
  return data;
}
export type ContractRow = NonNullable<Awaited<ReturnType<typeof getContract>>>;

export async function listMyContracts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id, kind, status, created_at, sent_at, signed_at, landlord_id, tenant_id, listing:listings!contracts_listing_id_fkey(id, title), landlord:profiles!contracts_landlord_id_fkey(display_name), tenant:profiles!contracts_tenant_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

/** Contrato vivo o firmado de una conversación (para enlazarlo desde el chat). */
export async function getContractForInterest(interestId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id, status")
    .eq("interest_id", interestId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Datos de partida del borrador, sacados del anuncio y de su dirección. */
export async function buildDraftFromInterest(interestId: string, landlordId: string) {
  const supabase = await createClient();
  const { data: interest } = await supabase
    .from("interests")
    .select("id, status, from_user, listing:listings!interests_listing_id_fkey(id, owner_id, kind, city, rental_term, available_from, available_until, monthly_rent, deposit, bills_included, furnished, rules), guest:profiles!interests_from_user_fkey(display_name)")
    .eq("id", interestId)
    .maybeSingle();
  const listing = interest?.listing;
  if (!interest || !listing || listing.owner_id !== landlordId || interest.status !== "accepted") return null;
  if (listing.kind !== "room" && listing.kind !== "flat") return null;

  const [{ data: address }, { data: me }] = await Promise.all([
    supabase.from("listing_addresses").select("address_line, floor_door, postal_code").eq("listing_id", listing.id).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", landlordId).maybeSingle(),
  ]);
  const rules = (listing.rules ?? {}) as Partial<Record<RuleKey, boolean>>;
  const houseRules = RULE_KEYS.filter((k) => rules[k] !== undefined)
    .map((k) => (rules[k] ? RULE_LABELS[k].yes : RULE_LABELS[k].no))
    .join(". ");
  const addressText = [address?.address_line, address?.floor_door, [address?.postal_code, listing.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const kind: ContractKind = suggestedKind(listing.kind, listing.rental_term);
  const terms: Partial<ContractTerms> = {
    landlord_name: me?.display_name ?? "",
    tenant_name: interest.guest?.display_name ?? "",
    address: addressText,
    monthly_rent: listing.monthly_rent ?? 0,
    deposit: listing.deposit ?? listing.monthly_rent ?? 0,
    payment_day: 5,
    start_date: listing.available_from ?? new Date().toISOString().slice(0, 10),
    end_date: listing.available_until ?? null,
    bills_included: listing.bills_included ?? false,
    furnished: listing.furnished ?? true,
    house_rules: houseRules ? `${houseRules}.` : "",
    seasonal_reason: listing.rental_term === "academic_year" ? "estudios durante el curso académico" : "",
  };
  return { listing, interestId: interest.id, tenantId: interest.from_user, kind, terms };
}

/** Condiciones guardadas → valores válidos (o los errores). */
export function parseTerms(raw: unknown) {
  return contractTermsSchema.safeParse(raw);
}
