"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { SESSION_EXPIRED_MESSAGE, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { EXTENSION_BY_TYPE, sniffImageType } from "@/lib/validation/image";
import { avatarFileSchema, fieldErrors, profileFormDataToObject, profileSchema } from "@/lib/validation/profile";

/** Mensaje de sesión caducada (auditoría I3): el formulario lo reconoce para ofrecer el enlace de acceso. */
const NOT_LOGGED_IN: FormState = { status: "error", message: SESSION_EXPIRED_MESSAGE };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Comprueba la foto elegida (tamaño, tipo declarado y tipo real por sus primeros bytes). */
async function readAvatar(value: FormDataEntryValue | null): Promise<{ error: string } | { bytes: Uint8Array; type: keyof typeof EXTENSION_BY_TYPE }> {
  const parsed = avatarFileSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Imagen no válida" };
  // El tipo declarado puede mentir: comprobamos los bytes reales.
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { error: "El archivo no es una imagen JPG, PNG o WebP válida" };
  return { bytes, type };
}

/** Sube la foto ya comprobada, la deja como avatar y borra la anterior. Devuelve el error, si lo hay. */
async function storeAvatar(supabase: Supabase, userId: string, avatar: { bytes: Uint8Array; type: keyof typeof EXTENSION_BY_TYPE }): Promise<string | null> {
  const path = `${userId}/avatar-${Date.now()}.${EXTENSION_BY_TYPE[avatar.type]}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, avatar.bytes, { contentType: avatar.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return "No hemos podido subir la imagen. Inténtalo de nuevo.";

  const { data: previous } = await supabase.from("profiles").select("avatar_path").eq("id", userId).single();
  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (updateError) {
    await supabase.storage.from("avatars").remove([path]);
    return "No hemos podido guardar la foto. Inténtalo de nuevo.";
  }
  if (previous?.avatar_path) await supabase.storage.from("avatars").remove([previous.avatar_path]);
  return null;
}

/**
 * Guarda el perfil y, si se ha elegido una, la foto: un solo botón para todo
 * (auditoría I7). Si la foto no vale, no se guarda NADA y se dice por qué: nunca
 * sale «Perfil guardado» con una foto rechazada.
 */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;

  const parsed = profileSchema.safeParse(profileFormDataToObject(formData));
  if (!parsed.success) {
    return { status: "error", message: "Revisa los campos marcados.", errors: fieldErrors(parsed.error) };
  }
  const p = parsed.data;

  const file = formData.get("avatar");
  const hasPhoto = file instanceof File && file.size > 0;
  const avatar = hasPhoto ? await readAvatar(file) : null;
  if (avatar && "error" in avatar) {
    return { status: "error", message: "No hemos guardado nada: revisa la foto.", errors: { avatar: avatar.error } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: p.displayName,
      bio: p.bio,
      city: p.city,
      occupation: p.occupation,
      birth_year: p.birthYear,
      languages: p.languages,
      roles: p.roles,
      habits: p.habits,
    })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: "No hemos podido guardar los cambios. Inténtalo de nuevo." };
  }

  revalidatePath(`/perfil/${user.id}`);
  if (avatar) {
    const photoError = await storeAvatar(supabase, user.id, avatar);
    revalidatePath("/perfil/editar");
    if (photoError) {
      return { status: "error", message: "Hemos guardado tus datos, pero no la foto.", errors: { avatar: photoError } };
    }
    return { status: "success", message: "Perfil y foto guardados." };
  }
  return { status: "success", message: "Perfil guardado." };
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
