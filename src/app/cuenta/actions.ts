"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const deleteSchema = z.object({
  confirm: z.literal("BORRAR", { error: "Escribe BORRAR en mayúsculas para confirmar" }),
});

/** Todas las rutas de un usuario en un bucket (carpeta {uid}/ y una subcarpeta). */
async function listOwnFiles(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, uid: string) {
  const paths: string[] = [];
  const { data: top } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
  for (const item of top ?? []) {
    if (item.id) {
      paths.push(`${uid}/${item.name}`);
    } else {
      // Sin id es una carpeta (p. ej. el id del anuncio).
      const { data: inner } = await supabase.storage.from(bucket).list(`${uid}/${item.name}`, { limit: 1000 });
      for (const f of inner ?? []) if (f.id) paths.push(`${uid}/${item.name}/${f.name}`);
    }
  }
  return paths;
}

/**
 * Borra la cuenta. Primero las fotos y el avatar de Storage (con la sesión de
 * la propia persona: RLS solo le deja tocar su carpeta) y después
 * delete_my_account, que borra el usuario y anonimiza el perfil en la BD.
 */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = deleteSchema.safeParse({ confirm: formData.get("confirm") });
  if (!parsed.success) return { status: "error", errors: { confirm: "Escribe BORRAR en mayúsculas para confirmar" } };

  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/cuenta");
  const supabase = await createClient();

  for (const bucket of ["avatars", "listing-photos"]) {
    const paths = await listOwnFiles(supabase, bucket, user.id);
    if (paths.length) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) return { status: "error", message: "No hemos podido borrar tus fotos. Inténtalo de nuevo." };
    }
  }

  const { error } = await supabase.rpc("delete_my_account", { p_confirm: parsed.data.confirm });
  if (error) return { status: "error", message: "No hemos podido borrar la cuenta. Inténtalo de nuevo." };

  await supabase.auth.signOut();
  redirect("/?cuenta=borrada");
}
