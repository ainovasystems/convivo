"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { EXTENSION_BY_TYPE, sniffImageType } from "@/lib/validation/image";
import { avatarFileSchema, fieldErrors, profileFormDataToObject, profileSchema } from "@/lib/validation/profile";

const NOT_LOGGED_IN: FormState = { status: "error", message: "Tu sesión ha caducado. Vuelve a entrar." };

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;

  const parsed = profileSchema.safeParse(profileFormDataToObject(formData));
  if (!parsed.success) {
    return { status: "error", message: "Revisa los campos marcados.", errors: fieldErrors(parsed.error) };
  }
  const p = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: p.displayName,
      bio: p.bio,
      city: p.city,
      occupation: p.occupation,
      age_range: p.ageRange,
      languages: p.languages,
      roles: p.roles,
      habits: p.habits,
    })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: "No hemos podido guardar los cambios. Inténtalo de nuevo." };
  }

  revalidatePath(`/perfil/${user.id}`);
  return { status: "success", message: "Perfil guardado." };
}

export async function uploadAvatar(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;

  const parsed = avatarFileSchema.safeParse(formData.get("avatar"));
  if (!parsed.success) {
    return { status: "error", errors: { avatar: parsed.error.issues[0]?.message ?? "Imagen no válida" } };
  }
  const file = parsed.data;

  // El tipo declarado puede mentir: comprobamos los bytes reales.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffImageType(bytes);
  if (!realType) {
    return { status: "error", errors: { avatar: "El archivo no es una imagen JPG, PNG o WebP válida" } };
  }

  const supabase = await createClient();
  const path = `${user.id}/avatar-${Date.now()}.${EXTENSION_BY_TYPE[realType]}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: realType, cacheControl: "31536000", upsert: false });
  if (uploadError) {
    return { status: "error", errors: { avatar: "No hemos podido subir la imagen. Inténtalo de nuevo." } };
  }

  const { data: previous } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (updateError) {
    await supabase.storage.from("avatars").remove([path]);
    return { status: "error", errors: { avatar: "No hemos podido guardar la foto. Inténtalo de nuevo." } };
  }
  if (previous?.avatar_path) {
    await supabase.storage.from("avatars").remove([previous.avatar_path]);
  }

  revalidatePath(`/perfil/${user.id}`);
  revalidatePath("/perfil/editar");
  return { status: "success", message: "Foto actualizada." };
}

export async function removeAvatar(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;

  const supabase = await createClient();
  const { data: previous } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) return { status: "error", message: "No hemos podido quitar la foto." };
  if (previous?.avatar_path) {
    await supabase.storage.from("avatars").remove([previous.avatar_path]);
  }

  revalidatePath(`/perfil/${user.id}`);
  revalidatePath("/perfil/editar");
  return { status: "success", message: "Foto eliminada." };
}
