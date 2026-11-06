"use client";

import { useActionState } from "react";

import { submitNotice } from "@/app/denunciar/actions";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { NOTICE_REASONS } from "@/lib/moderation/notices";

export function NoticeForm({ url, reviewId, email }: { url: string; reviewId: string; email: string }) {
  const [state, action] = useActionState(submitNotice, initialFormState);
  const errors = state.errors ?? {};
  if (state.status === "success") return <FormAlert state={state} />;

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <TextField
        id="url"
        label="Enlace al contenido"
        defaultValue={state.values?.url ?? url}
        placeholder="https://… (anuncio, perfil o reseña)"
        hint="Copia la dirección de la página del anuncio, del perfil o de la reseña."
        required
        error={errors.url}
      />
      <SelectField
        id="reason"
        label="Motivo"
        placeholder="Elige un motivo"
        options={Object.entries(NOTICE_REASONS).map(([value, label]) => ({ value, label }))}
        required
        error={errors.reason}
      />
      <TextAreaField
        id="explanation"
        label="Qué es ilegal y por qué"
        rows={6}
        maxLength={3000}
        required
        hint="Explícalo con detalle: qué parte del contenido, por qué es ilícito y, si te afecta, en qué. Mínimo 30 caracteres."
        error={errors.explanation}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="name" label="Tu nombre" autoComplete="name" defaultValue={state.values?.name} required error={errors.name} />
        <TextField
          id="email"
          label="Tu email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? email}
          required
          hint="Te enviaremos el acuse y la decisión."
          error={errors.email}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <input
            id="goodFaith"
            name="goodFaith"
            type="checkbox"
            required
            className="mt-1 size-4 accent-[var(--brand)]"
            aria-invalid={errors.goodFaith ? true : undefined}
            aria-describedby={errors.goodFaith ? "goodFaith-error" : undefined}
          />
          <label htmlFor="goodFaith" className="text-sm">
            Declaro de buena fe que la información de esta notificación es exacta y completa.
          </label>
        </div>
        {errors.goodFaith ? (
          <p id="goodFaith-error" className="text-sm text-red-700">
            {errors.goodFaith}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingText="Enviando…">Enviar notificación</SubmitButton>
    </form>
  );
}
