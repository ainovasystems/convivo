"use client";

import { useActionState } from "react";

import { deleteAccount } from "@/app/cuenta/actions";
import { TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <TextField
        id="confirm"
        label="Para confirmar, escribe BORRAR"
        autoComplete="off"
        autoCapitalize="characters"
        required
        error={state.errors?.confirm}
      />
      <SubmitButton pendingText="Borrando tu cuenta…">Borrar mi cuenta para siempre</SubmitButton>
    </form>
  );
}
