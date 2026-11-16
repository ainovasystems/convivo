import "server-only";

import { emailUser } from "@/lib/email/notify";
import { depositEmail } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Avisa por email a la otra parte de un contrato (nunca lanza: un fallo de
 * email no deshace la acción). `path` es la ruta a la que lleva el botón.
 */
export async function emailOtherParty(
  contractId: string,
  actorId: string,
  kind: Parameters<typeof depositEmail>[0]["kind"],
  path = "",
) {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("landlord_id, tenant_id, listing:listings!contracts_listing_id_fkey(title)")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return;
  const toLandlord = actorId === c.tenant_id;
  const site = await getSiteUrl();
  await emailUser(toLandlord ? c.landlord_id : c.tenant_id, () =>
    depositEmail({
      kind,
      party: toLandlord ? "landlord" : "tenant",
      listingTitle: c.listing?.title ?? "tu alquiler",
      url: `${site}/contratos/${contractId}${path}`,
    }),
  );
}
