"use client";

import { useActionState } from "react";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { useClientValidation } from "@/lib/use-client-validation";
import { passwordResetRequestSchema } from "@/lib/validation/auth";

export function PasswordResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(passwordResetRequestSchema);
  const errors = { ...state.errors, ...clientErrors };

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert state={state} />
      <TextField id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={errors.email} />
      <SubmitButton pendingText="Enviando…">Enviarme el enlace</SubmitButton>
    </form>
  );
}
