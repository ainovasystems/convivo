import "server-only";

import { getMailer, type EmailMessage } from "@/lib/email/mailer";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envía un email a un usuario por su id.
 *
 * Uso ACOTADO de service_role: los emails viven en auth.users, que ningún
 * usuario puede leer (ni debe). Solo se consulta el email del destinatario y
 * nunca se devuelve al cliente.
 *
 * Nunca lanza: un fallo de email no debe deshacer la acción del usuario.
 */
export async function emailUser(userId: string, build: () => Omit<EmailMessage, "to">): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.secretkey) {
      console.warn("[email] SUPABASE_SERVICE_ROLE_KEY no configurada: no se envía el email");
      return;
    }
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const to = data.user?.email;
    if (error || !to) return;
    await getMailer().send({ to, ...build() });
  } catch (error) {
    console.error("[email] error enviando notificación", error);
  }
}
