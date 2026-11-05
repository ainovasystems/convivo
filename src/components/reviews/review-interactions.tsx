"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { reportReview, respondToReview } from "@/app/resenas/actions";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/forms";
import { REPORT_REASONS } from "@/lib/reviews/schema";

export function RespondForm({ reviewId, path }: { reviewId: string; path: string }) {
  const [submitted, setSubmitted] = useState("");
  const [state, action] = useActionState(async (prev: FormState, fd: FormData) => {
    setSubmitted(String(fd.get("body") ?? "").trim());
    return respondToReview(prev, fd);
  }, initialFormState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  // Confirmada por el servidor: se muestra ya, sin esperar a recargar la página.
  if (state.status === "success") {
    return (
      <div className="ml-4 border-l-2 border-brand/40 pl-3 text-sm" role="status">
        <p className="font-medium">Respuesta de la persona reseñada</p>
        <p className="whitespace-pre-line text-muted">{submitted}</p>
      </div>
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand">Responder públicamente</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="reviewId" value={reviewId} />
        <input type="hidden" name="path" value={path} />
        <FormAlert state={state} />
        <TextAreaField
          id={`response-${reviewId}`}
          name="body"
          label="Tu respuesta"
          rows={3}
          maxLength={1000}
          hint="Solo puedes responder una vez y no podrás editarla. Mantén un tono respetuoso."
          error={state.errors?.body}
        />
        <SubmitButton pendingText="Publicando…">Publicar respuesta</SubmitButton>
      </form>
    </details>
  );
}

export function ReportForm({ reviewId, path }: { reviewId: string; path: string }) {
  const [state, action] = useActionState(reportReview, initialFormState);
  if (state.status === "success") return <FormAlert state={state} />;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline">Denunciar reseña</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="reviewId" value={reviewId} />
        <input type="hidden" name="path" value={path} />
        <FormAlert state={state} />
        <SelectField
          id={`reason-${reviewId}`}
          name="reason"
          label="Motivo"
          placeholder="Elige un motivo"
          options={Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label }))}
          error={state.errors?.reason}
        />
        <TextAreaField id={`details-${reviewId}`} name="details" label="Detalles (opcional)" rows={2} maxLength={1000} />
        <SubmitButton pendingText="Enviando…">Enviar denuncia</SubmitButton>
      </form>
    </details>
  );
}
