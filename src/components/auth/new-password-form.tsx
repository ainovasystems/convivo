"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { setNewPassword } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/field";
import { buttonClass, SubmitButton } from "@/components/ui/submit-button";
import { RECOVERY_EXPIRED_PATH } from "@/lib/account/password-recovery";
import { initialFormState } from "@/lib/forms";
import { useClientValidation } from "@/lib/use-client-validation";
import { newPasswordSchema } from "@/lib/validation/auth";

export function NewPasswordForm() {
  const router = useRouter();
  const [state, action] = useActionState(setNewPassword, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(newPasswordSchema);
  const errors = { ...state.errors, ...clientErrors };
  const done = state.status === "success";

  // La cabecera se pinta en el servidor: se refresca para que muestre la sesión.
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  if (done) {
    return (
      <div className="space-y-6">
        <FormAlert state={state} />
        <p className="text-muted">A partir de ahora entra con tu email y esta contraseña. Hemos cerrado la sesión en tus otros dispositivos.</p>
        <Link href="/" className={buttonClass}>
          Ir al inicio
        </Link>
      </div>
    );
  }

  // El enlace caducó mientras se escribía: se explica y se ofrece pedir otro.
  if (state.errors?._expired) {
    return (
      <div className="space-y-6">
        <FormAlert state={state} />
        <Link href={RECOVERY_EXPIRED_PATH} className={buttonClass}>
          Pedir otro enlace
        </Link>
      </div>
    );
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <TextField
        id="password"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo 8 caracteres."
        error={errors.password}
      />
      <TextField
        id="passwordConfirm"
        label="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        required
        error={errors.passwordConfirm}
      />
      <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
