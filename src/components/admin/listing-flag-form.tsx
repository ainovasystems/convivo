"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { resolveListingFlag } from "@/app/admin/actions";
import { inputClass } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { initialFormState } from "@/lib/forms";

export function ListingFlagForm({ flagId }: { flagId: string }) {
  const [state, action] = useActionState(resolveListingFlag, initialFormState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  if (state.status === "success") return <FormAlert state={state} />;

  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="flagId" value={flagId} />
      <label htmlFor={`flag-note-${flagId}`} className="block text-sm font-medium">
        Nota de la decisión
      </label>
      <input id={`flag-note-${flagId}`} name="note" className={inputClass} placeholder="Qué has comprobado" required />
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="dismiss" className="rounded-full border border-border px-3 py-1.5 text-sm font-medium">
          Es legítimo: descartar marca
        </button>
        <button name="decision" value="close_listing" className="rounded-full bg-red-700 px-3 py-1.5 text-sm font-medium text-white">
          Cerrar anuncio
        </button>
      </div>
    </form>
  );
}
