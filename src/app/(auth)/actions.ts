"use server";

import { redirect } from "next/navigation";

import {
  PASSWORD_CHANGED_MESSAGE,
  RECOVERY_EXPIRED_MESSAGE,
  RECOVERY_NEW_PASSWORD_PATH,
  RECOVERY_SENT_MESSAGE,
} from "@/lib/account/password-recovery";
import { getRecoveryUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { getSiteUrl } from "@/lib/site-url";
import { authAttemptAllowed, recordLoginFailure, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import { recordSignal } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";
import {
  magicLinkSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  TERMS_VERSION,
} from "@/lib/validation/auth";
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

/**
 * «¿Olvidaste tu contraseña?»: envía el email con el enlace. La respuesta es
 * SIEMPRE la misma, exista o no la cuenta y aunque Supabase no lo haya enviado
 * (p. ej. porque se acaba de pedir otro): no se puede saber quién tiene cuenta.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", values: keep(formData, "email"), errors: fieldErrors(parsed.error) };
  }
  // El límite depende de cuántas veces se pide, no de si la cuenta existe.
  if (!(await authAttemptAllowed("password_reset", parsed.data.email))) {
    return { status: "error", values: keep(formData, "email"), message: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(RECOVERY_NEW_PASSWORD_PATH)}`,
  });
  if (error) console.error("resetPasswordForEmail", error.status, error.code);
  return { status: "success", message: RECOVERY_SENT_MESSAGE };
}

/**
 * Guarda la contraseña nueva. Solo vale con la sesión que abre el enlace del
 * email (getRecoveryUser): con cualquier otra sesión, o pasado el margen, se
 * pide otro enlace. Sirve también a quien solo entraba con enlace mágico.
 */
export async function setNewPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getRecoveryUser();
  if (!user) return { status: "error", message: RECOVERY_EXPIRED_MESSAGE, errors: { _expired: "1" } };

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { status: "error", errors: { password: "Esa es la contraseña que ya tenías. Elige otra distinta." } };
    }
    if (error.code === "weak_password") {
      return { status: "error", errors: { password: "Esa contraseña es demasiado débil. Prueba con otra más larga." } };
    }
    if (error.status === 429) return { status: "error", message: TOO_MANY_ATTEMPTS };
    if (error.status === 401 || error.status === 403 || error.code === "session_not_found") {
      return { status: "error", message: RECOVERY_EXPIRED_MESSAGE, errors: { _expired: "1" } };
    }
    console.error("updateUser(password)", error.status, error.code);
    return { status: "error", message: "No hemos podido guardar la contraseña. Inténtalo de nuevo." };
  }

  // Quien tuviera la cuenta abierta en otro dispositivo se queda fuera: si se
  // recupera la contraseña por un susto, la sesión ajena no sobrevive.
  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  await recordSignal();
  return { status: "success", message: PASSWORD_CHANGED_MESSAGE };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    isAdult: formData.get("isAdult"),
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
      // Constancia de la aceptación (LSSI) y de la declaración de mayoría de edad.
      data: {
        display_name: parsed.data.displayName,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
        adult_declared_at: new Date().toISOString(),
      },
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
