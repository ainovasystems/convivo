"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { useClientValidation } from "@/lib/use-client-validation";
import { signUpSchema } from "@/lib/validation/auth";

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(signUpSchema);
  const errors = { ...state.errors, ...clientErrors };

  if (state.status === "success") {
    return <FormAlert state={state} />;
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <TextField
        id="displayName"
        label="Nombre"
        autoComplete="given-name"
        required
        maxLength={60}
        hint="Es el nombre que verán los demás. Puedes usar solo tu nombre de pila."
        error={errors.displayName}
      />
      <TextField id="email" label="Email" type="email" autoComplete="email" required error={errors.email} />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo 8 caracteres."
        error={errors.password}
      />
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            required
            className="mt-1 size-4 accent-[var(--brand)]"
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={errors.acceptTerms ? "acceptTerms-error" : undefined}
          />
          <label htmlFor="acceptTerms" className="text-sm">
            Acepto las condiciones de uso y la política de privacidad.
          </label>
        </div>
        {errors.acceptTerms ? (
          <p id="acceptTerms-error" className="text-sm text-red-700 dark:text-red-400">
            {errors.acceptTerms}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingText="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/entrar" className="font-medium text-brand underline">
          Entra
        </Link>
      </p>
    </form>
  );
}
