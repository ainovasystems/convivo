"use client";

import { useActionState, useState } from "react";

import { expressInterest } from "@/app/mensajes/actions";
import { TextAreaField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { useClientValidation } from "@/lib/use-client-validation";
import { interestMessageSchema } from "@/lib/conversations/schema";

export function InterestForm({ listingId, ownerName }: { listingId: string; ownerName: string }) {
  const [state, action] = useActionState(expressInterest, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(interestMessageSchema);
  const errors = { ...state.errors, ...clientErrors };
  const [length, setLength] = useState(0);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-3">
      <input type="hidden" name="listingId" value={listingId} />
      <FormAlert state={state} />
      <TextAreaField
        id="message"
        label={`Escribe a ${ownerName}`}
        rows={5}
        maxLength={500}
        required
        onChange={(e) => setLength(e.currentTarget.value.trim().length)}
        placeholder="Preséntate: a qué te dedicas, cuándo quieres entrar y cómo eres en casa."
        hint={`${length}/500 caracteres (mínimo 20).`}
        error={errors.message}
      />
      <SubmitButton pendingText="Enviando…">Me interesa</SubmitButton>
    </form>
  );
}
