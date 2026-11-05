"use client";

import { useState, useTransition } from "react";

import { decideInterest } from "@/app/mensajes/actions";
import type { InterestAction } from "@/lib/conversations/state";

const btn = "rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50";

export function InterestActions({ interestId, actions }: { interestId: string; actions: InterestAction[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (decision: "accepted" | "declined" | "withdrawn", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const r = await decideInterest(interestId, decision);
      if (r.status === "error") setError(r.message ?? "Error");
    });
  };
  if (!actions.some((a) => a === "accept" || a === "decline" || a === "withdraw")) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.includes("accept") ? (
          <button type="button" disabled={pending} onClick={() => run("accepted")} className={btn + " border-brand bg-brand text-brand-foreground"}>
            Aceptar interés
          </button>
        ) : null}
        {actions.includes("decline") ? (
          <button type="button" disabled={pending} onClick={() => run("declined", "¿Rechazar este interés? Se cerrará la conversación.")} className={btn + " border-border"}>
            Rechazar
          </button>
        ) : null}
        {actions.includes("withdraw") ? (
          <button type="button" disabled={pending} onClick={() => run("withdrawn", "¿Retirar tu interés? Se cerrará la conversación.")} className={btn + " border-border"}>
            Retirar mi interés
          </button>
        ) : null}
      </div>
      {actions.includes("accept") ? (
        <p className="text-xs text-muted">Al aceptar, esta persona podrá ver la dirección exacta del anuncio.</p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
