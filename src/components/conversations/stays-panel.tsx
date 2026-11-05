"use client";

import { useActionState, useState, useTransition } from "react";

import { addParticipant, proposeStay, stayAction } from "@/app/mensajes/actions";
import { TextField } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Conversation } from "@/lib/conversations/queries";
import { STAY_STATUS_LABELS, stayActions } from "@/lib/conversations/state";
import { initialFormState } from "@/lib/forms";
import { formatShortDate } from "@/lib/listings/options";

type Stay = Conversation["stays"][number];
const btn = "rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50";

export function StaysPanel({
  interestId,
  currentUserId,
  listingKind,
  canPropose,
  stays,
  names,
}: {
  interestId: string;
  currentUserId: string;
  listingKind: "room" | "flat" | "seeking";
  canPropose: boolean;
  stays: Stay[];
  names: Record<string, string>;
}) {
  const hasOpen = stays.some((s) => s.status === "proposed" || s.status === "active");
  return (
    <section aria-labelledby="estancias" className="space-y-4">
      <h2 id="estancias" className="text-lg font-semibold">
        Estancia
      </h2>
      {stays.length ? (
        <ul className="space-y-3">
          {stays.map((s) => (
            <StayItem key={s.id} stay={s} interestId={interestId} currentUserId={currentUserId} listingKind={listingKind} names={names} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Cuando os pongáis de acuerdo, registra la estancia. Solo las estancias confirmadas por ambas partes permiten dejar reseñas.
        </p>
      )}
      {canPropose && !hasOpen ? <ProposeForm interestId={interestId} /> : null}
    </section>
  );
}

function StayItem({
  stay,
  interestId,
  currentUserId,
  listingKind,
  names,
}: {
  stay: Stay;
  interestId: string;
  currentUserId: string;
  listingKind: "room" | "flat" | "seeking";
  names: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const actions = stayActions(stay, currentUserId, listingKind);
  const run = (action: "confirm_stay" | "cancel_stay" | "end_stay", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const r = await stayAction(stay.id, action, interestId);
      if (r.status === "error") setError(r.message ?? "Error");
    });
  };
  const waitingFor =
    stay.status === "proposed"
      ? !stay.host_confirmed_at
        ? names[stay.host_id]
        : !stay.guest_confirmed_at
          ? names[stay.guest_id]
          : null
      : null;

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {stay.end_date
            ? `Del ${formatShortDate(stay.start_date)} al ${formatShortDate(stay.end_date)}`
            : `Desde el ${formatShortDate(stay.start_date)}`}
        </p>
        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">{STAY_STATUS_LABELS[stay.status]}</span>
      </div>
      {waitingFor ? <p className="text-sm text-muted">Falta que confirme {waitingFor}.</p> : null}
      {stay.stay_participants.length ? (
        <p className="text-sm text-muted">
          Compañeros:{" "}
          {stay.stay_participants
            .map((p) => `${p.profile?.display_name ?? "?"}${p.confirmed_at ? "" : " (pendiente)"}`)
            .join(", ")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.includes("confirm") ? (
          <button type="button" disabled={pending} className={btn + " border-brand bg-brand text-brand-foreground"} onClick={() => run("confirm_stay")}>
            Confirmar estancia
          </button>
        ) : null}
        {actions.includes("cancel") ? (
          <button type="button" disabled={pending} className={btn + " border-border"} onClick={() => run("cancel_stay", "¿Cancelar esta propuesta de estancia?")}>
            {stay.proposed_by === currentUserId ? "Retirar propuesta" : "Rechazar"}
          </button>
        ) : null}
        {actions.includes("end") ? (
          <button type="button" disabled={pending} className={btn + " border-border"} onClick={() => run("end_stay", "¿Dar la estancia por terminada hoy?")}>
            Terminar estancia
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      {actions.includes("add_participant") ? <AddParticipantForm stayId={stay.id} interestId={interestId} /> : null}
    </li>
  );
}

function ProposeForm({ interestId }: { interestId: string }) {
  const [state, action] = useActionState(proposeStay, initialFormState);
  return (
    <form action={action} className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <h3 className="font-medium">Proponer estancia</h3>
      <input type="hidden" name="interestId" value={interestId} />
      <FormAlert state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id="startDate" label="Fecha de entrada" type="date" required error={state.errors?.startDate} />
        <TextField id="endDate" label="Fecha de salida (opcional)" type="date" error={state.errors?.endDate} />
      </div>
      <SubmitButton pendingText="Enviando…">Proponer estancia</SubmitButton>
    </form>
  );
}

function AddParticipantForm({ stayId, interestId }: { stayId: string; interestId: string }) {
  const [state, action] = useActionState(addParticipant, initialFormState);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand">Añadir compañeros de piso</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="stayId" value={stayId} />
        <input type="hidden" name="interestId" value={interestId} />
        <FormAlert state={state} />
        <TextField
          id="profile"
          label="Enlace al perfil de tu compañero/a"
          placeholder="https://…/perfil/…"
          hint="Lo encuentra en «Mi perfil». Tendrá que confirmar su participación."
          error={state.errors?.profile}
        />
        <SubmitButton pendingText="Añadiendo…">Añadir</SubmitButton>
      </form>
    </details>
  );
}
