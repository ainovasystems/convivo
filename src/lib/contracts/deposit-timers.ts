import "server-only";

import { depositEmail, type DepositEmailKind } from "@/lib/email/templates";
import { emailUser } from "@/lib/email/notify";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Parte de la tarea diaria (ver /api/cron/review-windows): llama a
 * deposit_timers_run() (solo service_role), que en la BD da por confirmadas las
 * entregas de llaves sin respuesta en 7 días y avisa 7 días antes de que venza
 * el plazo de devolución y cuando vence (avisos in-app y constancia incluidos).
 * Aquí solo se mandan los emails. Idempotente: cada aviso sale una sola vez.
 *
 * Uso acotado de service_role (el mismo que el de los avisos de reseña).
 */
export async function runDepositTimers(site: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("deposit_timers_run");
  // Lanzar para que el monitor de la tarea marque la ejecución como fallida.
  if (error) throw new Error(`deposit_timers_run: ${error.message}`);

  let sent = 0;
  for (const n of data ?? []) {
    const party = n.party === "landlord" ? "landlord" : "tenant";
    await emailUser(n.user_id, () =>
      depositEmail({
        kind: n.kind as DepositEmailKind,
        party,
        listingTitle: n.listing_title,
        keysOn: n.keys_on,
        dueOn: n.due_on,
        url: `${site}/contratos/${n.contract_id}`,
      }),
    );
    sent++;
  }
  return sent;
}
