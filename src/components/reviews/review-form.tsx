"use client";

import { useActionState, useState } from "react";

import { createReview } from "@/app/resenas/actions";
import { TextAreaField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { CRITERIA_LABELS, type ReviewRelationship } from "@/lib/reviews/labels";
import { reviewFormDataToObject, reviewSchema } from "@/lib/reviews/schema";
import { CRITERIA_BY_RELATIONSHIP, CRITERIA_HINTS } from "@/lib/reviews/targets";
import { useClientValidation } from "@/lib/use-client-validation";

/** Selector de 1 a 5 accesible (grupo de radios). */
function ScoreInput({ name, label, hint, error }: { name: string; label: string; hint?: string; error?: string }) {
  const id = name.replace(".", "-");
  return (
    <fieldset className="space-y-1" aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name={name} value={n} className="peer sr-only" aria-label={`${n} de 5`} />
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-md border border-border font-semibold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
            >
              {n}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ReviewForm({
  stayId,
  subjectType,
  subjectId,
  relationship,
}: {
  stayId: string;
  subjectType: "listing" | "user";
  subjectId: string;
  relationship: ReviewRelationship;
}) {
  const [state, action] = useActionState(createReview, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(reviewSchema, reviewFormDataToObject);
  const errors = { ...state.errors, ...clientErrors };
  const [length, setLength] = useState(0);

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="stayId" value={stayId} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="relationship" value={relationship} />
      <FormAlert state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        {CRITERIA_BY_RELATIONSHIP[relationship].map((key) => (
          <ScoreInput
            key={key}
            name={`criteria.${key}`}
            label={CRITERIA_LABELS[key] ?? key}
            hint={CRITERIA_HINTS[key]}
            error={errors[`criteria.${key}`]}
          />
        ))}
      </div>

      <ScoreInput name="rating" label="Valoración general" error={errors.rating} />

      <TextAreaField
        id="body"
        label="Tu experiencia"
        rows={7}
        maxLength={1500}
        onChange={(e) => setLength(e.currentTarget.value.trim().length)}
        hint={`${length}/1500 caracteres (mínimo 50). Sé concreto/a y justo/a. No incluyas teléfonos, direcciones ni datos personales.`}
        error={errors.body}
      />

      <div className="rounded-md bg-brand/5 p-3 text-sm">
        <p className="font-medium">Cómo funciona el doble ciego</p>
        <p className="mt-1 text-muted">
          La otra parte no verá tu reseña (ni tú la suya) hasta que ambos hayáis opinado o pasen 14 días desde que se
          abrió la ventana. Después no se puede editar.
        </p>
      </div>

      <SubmitButton pendingText="Enviando…">Enviar reseña</SubmitButton>
    </form>
  );
}
