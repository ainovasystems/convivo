"use server";

import { redirect } from "next/navigation";

import type { FormState } from "@/lib/forms";
import { getSiteUrl } from "@/lib/site-url";
import { authAttemptAllowed, recordLoginFailure, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import { recordSignal } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema, safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/profile";

/** Campos de texto a devolver al formulario (nunca la contraseña). */
function keep(formData: FormData, ...keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "").slice(0, 200)]));
}

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", values: keep(formData, "email"), errors: fieldErrors(parsed.error) };
  }

  // Mismo mensaje exista o no la cuenta: el bloqueo depende de los fallos, no de quién eres.
  if (!(await authAttemptAllowed("login_failed", parsed.data.email))) {
    return { status: "error", values: keep(formData, "email"), message: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "email_not_confirmed" && error.status !== 429) await recordLoginFailure(parsed.data.email);
    if (error.code === "email_not_confirmed") {
      return { status: "error", values: keep(formData, "email"), message: "Antes de entrar, confirma tu email con el enlace que te enviamos." };
    }
    if (error.status === 429) {
      return { status: "error", values: keep(formData, "email"), message: TOO_MANY_ATTEMPTS };
    }
    // Mensaje genérico: no revelamos si el email existe.
    return { status: "error", values: keep(formData, "email"), message: "Email o contraseña incorrectos." };
  }

  await recordSignal();
  redirect(safeNextPath(formData.get("next")));
}

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", values: keep(formData, "email"), errors: fieldErrors(parsed.error) };
  }

  const next = safeNextPath(formData.get("next"));
  if (!(await authAttemptAllowed("magic_link", parsed.data.email))) {
    return { status: "error", values: keep(formData, "email"), message: TOO_MANY_ATTEMPTS };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error?.status === 429) {
    return { status: "error", values: keep(formData, "email"), message: "Ya te enviamos un enlace hace poco. Espera un minuto antes de pedir otro." };
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
    return { status: "error", values: keep(formData, "email", "displayName"), errors: fieldErrors(parsed.error) };
  }

  if (!(await authAttemptAllowed("signup", parsed.data.email))) {
    return { status: "error", values: keep(formData, "email", "displayName"), message: TOO_MANY_ATTEMPTS };
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
      return { status: "error", values: keep(formData, "email", "displayName"), message: "Ya existe una cuenta con ese email. Prueba a entrar." };
    }
    if (error.code === "weak_password") {
      return { status: "error", values: keep(formData, "email", "displayName"), errors: { password: "Esa contraseña es demasiado débil. Prueba con otra más larga." } };
    }
    if (error.status === 429) {
      return { status: "error", values: keep(formData, "email", "displayName"), message: TOO_MANY_ATTEMPTS };
    }
    return { status: "error", values: keep(formData, "email", "displayName"), message: "No hemos podido crear la cuenta. Inténtalo de nuevo." };
  }

  // Con la confirmación de email desactivada (local) ya hay sesión.
  if (data.session) {
    await recordSignal();
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
