"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { decideNotice } from "@/app/admin/actions";
import { inputClass } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { initialFormState } from "@/lib/forms";

const REMOVE_LABEL: Record<string, string | null> = {
  listing: "Cerrar el anuncio",
  review: "Eliminar la reseña (queda constancia sin el texto)",
  profile: null,
  other: null,
};

export function NoticeDecisionForm({ noticeId, targetType }: { noticeId: string; targetType: string }) {
  const [state, action] = useActionState(decideNotice, initialFormState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  if (state.status === "success") return <FormAlert state={state} />;
  const removeLabel = REMOVE_LABEL[targetType];

  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="noticeId" value={noticeId} />
      <label htmlFor={`notice-note-${noticeId}`} className="block text-sm font-medium">
        Motivo de la decisión (se envía a quien notificó y, si se retira, a quien lo publicó)
      </label>
      <textarea id={`notice-note-${noticeId}`} name="note" rows={3} className={inputClass} required />
      {removeLabel ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="removeContent" className="size-4 accent-[var(--brand)]" />
          {removeLabel} al aceptar
        </label>
      ) : (
        <p className="text-xs text-muted">Para perfiles u otros contenidos, la retirada se hace a mano; aquí queda la decisión.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="actioned" className="rounded-full bg-red-700 px-3 py-1.5 text-sm font-medium text-white">
          Es ilícito: actuar
        </button>
        <button name="decision" value="rejected" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium">
          No es ilícito: rechazar
        </button>
      </div>
    </form>
  );
}
