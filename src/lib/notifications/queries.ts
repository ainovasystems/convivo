import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type NotificationView = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  /** Pide que el usuario haga algo y todavía no lo ha hecho. */
  needs_action: boolean;
  /** Vigente: pide acción o es una novedad sin leer. Es lo que cuenta el contador. */
  pending: boolean;
};

/** Mis avisos: primero los pendientes, después los ya atendidos o leídos. */
export async function getMyNotifications(limit = 60): Promise<NotificationView[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_notifications", { p_limit: limit });
  return data ?? [];
}

/** Cuántos avisos tengo sin atender (cabecera y barra inferior). Una consulta por petición. */
export const getNotificationCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_notification_count");
  return typeof data === "number" ? data : 0;
});
