"use client";

import { useState, useTransition } from "react";

import { stayAction } from "@/app/mensajes/actions";

export function ParticipationActions({ stayId }: { stayId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "confirm_stay_participation" | "decline_stay_participation") =>
    start(async () => {
      const r = await stayAction(stayId, action);
      if (r.status === "error") setError(r.message ?? "Error");
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run("confirm_stay_participation")} className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50">
          Confirmar que conviví/convivo
        </button>
        <button type="button" disabled={pending} onClick={() => run("decline_stay_participation")} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50">
          No es correcto
        </button>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
