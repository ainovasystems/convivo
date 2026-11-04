"use server";

import { redirect } from "next/navigation";

import type { FormState } from "@/lib/forms";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema, safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/profile";

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { status: "error", message: "Antes de entrar, confirma tu email con el enlace que te enviamos." };
    }
    if (error.status === 429) {
      return { status: "error", message: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
    }
    // Mensaje genérico: no revelamos si el email existe.
    return { status: "error", message: "Email o contraseña incorrectos." };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", errors: fieldErrors(parsed.error) };
  }

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error?.status === 429) {
    return { status: "error", message: "Ya te enviamos un enlace hace poco. Espera un minuto antes de pedir otro." };
  }
  // Mismo mensaje exista o no la cuenta (evita enumerar usuarios).
  return {
    status: "success",
    message: "Si hay una cuenta con ese email, te hemos enviado un enlace para entrar. Revisa tu bandeja (y el spam).",
  };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms"),
  });
  if (!parsed.success) {
    return { status: "error", errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent("/perfil/editar?bienvenida=1")}`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { status: "error", message: "Ya existe una cuenta con ese email. Prueba a entrar." };
    }
    if (error.code === "weak_password") {
      return { status: "error", errors: { password: "Esa contraseña es demasiado débil. Prueba con otra más larga." } };
    }
    if (error.status === 429) {
      return { status: "error", message: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
    }
    return { status: "error", message: "No hemos podido crear la cuenta. Inténtalo de nuevo." };
  }

  // Con la confirmación de email desactivada (local) ya hay sesión.
  if (data.session) {
    redirect("/perfil/editar?bienvenida=1");
  }
  return {
    status: "success",
    message: `Te hemos enviado un email a ${parsed.data.email}. Abre el enlace para confirmar tu cuenta.`,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
