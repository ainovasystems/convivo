"use client";

import { useActionState } from "react";

import { dismissReport, removeReview } from "@/app/admin/actions";
import { FormAlert } from "@/components/ui/form-alert";
import { inputClass } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";

export function ModerationForms({ reportId, reviewId }: { reportId: string; reviewId: string | null }) {
  const [dismissState, dismiss] = useActionState(dismissReport, initialFormState);
  const [removeState, remove] = useActionState(removeReview, initialFormState);
  const state = removeState.message ? removeState : dismissState;
  if (state.status === "success") return <FormAlert state={state} />;

  return (
    <div className="space-y-2">
      <FormAlert state={state} />
      <form className="space-y-2">
        <input type="hidden" name="reportId" value={reportId} />
        {reviewId ? <input type="hidden" name="reviewId" value={reviewId} /> : null}
        <label htmlFor={`note-${reportId}`} className="block text-sm font-medium">
          Nota de la decisión
        </label>
        <input id={`note-${reportId}`} name="note" className={inputClass} placeholder="Motivo de la decisión" required />
        <div className="flex flex-wrap gap-2">
          <button formAction={dismiss} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
            Descartar denuncia
          </button>
          {reviewId ? (
            <button formAction={remove} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white">
              Eliminar reseña
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
