"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmSettlement,
  deleteSettlementItem,
  openSettlement,
  reopenSettlement,
  respondSettlement,
  saveSettlementItem,
  sendSettlement,
  type SettlementResult,
} from "@/app/contratos/[id]/fianza/liquidacion/actions";
import { inputClass, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";
import { CONFIRM_NOTICE } from "@/lib/contracts/settlement";

/** Ejecuta una acción y refresca la página con lo que confirmó el servidor. */
function useSettlementAction() {
  const router = useRouter();
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<SettlementResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { result, pending, run };
}

function Message({ result }: { result: SettlementResult | null }) {
  if (!result?.message) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={"text-sm " + (result.ok ? "text-emerald-800" : "text-red-700")}>
      {result.message}
    </p>
  );
}

const secondaryClass = "rounded-full border border-brand px-5 py-2.5 font-bold text-brand hover:bg-brand-soft disabled:opacity-60";

export function OpenSettlementButton({ contractId }: { contractId: string }) {
  const { result, pending, run } = useSettlementAction();
  return (
    <div className="space-y-2">
      <button type="button" className={buttonClass} disabled={pending} onClick={() => run(() => openSettlement(contractId))}>
        {pending ? "Abriendo…" : "Abrir la liquidación"}
      </button>
      <Message result={result} />
    </div>
  );
}

export type Candidate = { id: string; label: string };

/** Alta de una partida: concepto, importe y, si procede, un daño nuevo del inventario. */
export function AddItemForm({ settlementId, candidates }: { settlementId: string; candidates: Candidate[] }) {
  const { result, pending, run } = useSettlementAction();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [element, setElement] = useState("");
  return (
    <form
      className="space-y-3 rounded-2xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveSettlementItem(settlementId, null, { concept, amount, inventory_item_id: element || null }),
          () => {
            setConcept("");
            setAmount("");
            setElement("");
          },
        );
      }}
    >
      <h3 className="font-bold">Añadir una partida</h3>
      {candidates.length > 0 ? (
        <div className="space-y-1">
          <label htmlFor="settlement-element" className="block text-sm font-semibold">
            Elemento del inventario (opcional: solo daños nuevos)
          </label>
          <select
            id="settlement-element"
            className={inputClass}
            value={element}
            onChange={(e) => {
              setElement(e.target.value);
              const c = candidates.find((x) => x.id === e.target.value);
              if (c && !concept.trim()) setConcept(`Daño en ${c.label}`);
            }}
          >
            <option value="">Sin elemento (otro concepto)</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <TextField id="settlement-concept" label="Concepto" maxLength={120} required value={concept} onChange={(e) => setConcept(e.target.value)} error={result?.errors?.concept} />
      <TextField
        id="settlement-amount"
        label="Importe en €"
        inputMode="decimal"
        autoComplete="off"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint="Lo decides tú: Hommie no propone cifras."
        error={result?.errors?.amount}
      />
      <button type="submit" className={buttonClass} disabled={pending || !concept.trim() || !amount.trim()}>
        {pending ? "Guardando…" : "Añadir la partida"}
      </button>
      <Message result={result} />
    </form>
  );
}

export function DeleteItemButton({ itemId, concept }: { itemId: string; concept: string }) {
  const { result, pending, run } = useSettlementAction();
  return (
    <span>
      <button type="button" className="text-sm font-semibold text-red-700 underline disabled:opacity-60" disabled={pending} onClick={() => run(() => deleteSettlementItem(itemId))} aria-label={`Quitar la partida ${concept}`}>
        Quitar
      </button>
      <Message result={result} />
    </span>
  );
}

export function SendSettlementButton({ contractId, settlementId, items }: { contractId: string; settlementId: string; items: number }) {
  const { result, pending, run } = useSettlementAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonClass}
        disabled={pending}
        onClick={() => {
          const ask = items === 0 ? "¿Enviar la liquidación SIN descuentos? Tu inquilino solo tendrá que confirmarla." : "¿Enviar la liquidación a tu inquilino? Ya no podrás cambiar las partidas (podrás reabrirla).";
          if (window.confirm(ask)) run(() => sendSettlement(contractId, settlementId));
        }}
      >
        {pending ? "Enviando…" : items === 0 ? "Enviar sin descuentos" : "Enviar al inquilino"}
      </button>
      <Message result={result} />
    </div>
  );
}

export function ReopenButton({ contractId, settlementId }: { contractId: string; settlementId: string }) {
  const { result, pending, run } = useSettlementAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={secondaryClass}
        disabled={pending}
        onClick={() => {
          if (window.confirm("¿Reabrir la liquidación para cambiarla? Se borran las respuestas actuales (quedan en la cronología) y habrá que volver a enviarla.")) run(() => reopenSettlement(contractId, settlementId));
        }}
      >
        Reabrir para cambiarla
      </button>
      <Message result={result} />
    </div>
  );
}

export function ConfirmSettlementButton({ contractId, settlementId, disputed }: { contractId: string; settlementId: string; disputed: boolean }) {
  const { result, pending, run } = useSettlementAction();
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{CONFIRM_NOTICE}</p>
      <button
        type="button"
        className={buttonClass}
        disabled={pending}
        onClick={() => {
          const ask = disputed ? "Hay partidas rechazadas. ¿Confirmas el registro tal como está, con las discrepancias?" : "¿Confirmas la liquidación?";
          if (window.confirm(ask)) run(() => confirmSettlement(contractId, settlementId));
        }}
      >
        {pending ? "Confirmando…" : "Confirmar la liquidación"}
      </button>
      <Message result={result} />
    </div>
  );
}

export type AnswerItem = { id: string; concept: string; amountLabel: string; response: "accepted" | "rejected" | null; comment: string | null };

/** El inquilino responde a todas las partidas: acepto / no acepto, con comentario. */
export function RespondForm({ contractId, settlementId, items }: { contractId: string; settlementId: string; items: AnswerItem[] }) {
  const { result, pending, run } = useSettlementAction();
  const [answers, setAnswers] = useState(() =>
    items.map((i) => ({ item_id: i.id, response: (i.response ?? "") as "" | "accepted" | "rejected", comment: i.comment ?? "" })),
  );
  const set = (idx: number, patch: Partial<(typeof answers)[number]>) => setAnswers((a) => a.map((x, k) => (k === idx ? { ...x, ...patch } : x)));
  const complete = answers.every((a) => a.response !== "");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => respondSettlement(contractId, settlementId, answers));
      }}
    >
      <h3 className="font-bold">Tu respuesta, partida por partida</h3>
      {items.map((item, idx) => {
        const err = result?.errors?.[`answer-${idx}`];
        return (
          <fieldset key={item.id} className="space-y-2 rounded-2xl border border-border p-4">
            <legend className="px-1 font-semibold">
              {item.concept} · {item.amountLabel}
            </legend>
            <div className="flex flex-wrap gap-4">
              {(["accepted", "rejected"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name={`resp-${item.id}`} value={v} checked={answers[idx].response === v} onChange={() => set(idx, { response: v })} className="size-5 accent-[var(--color-brand)]" />
                  {v === "accepted" ? "Acepto" : "No acepto"}
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <label htmlFor={`comment-${item.id}`} className="block text-sm font-semibold">
                Comentario {answers[idx].response === "rejected" ? "(obligatorio si no aceptas)" : "(opcional)"}
              </label>
              <textarea
                id={`comment-${item.id}`}
                className={inputClass}
                rows={2}
                maxLength={500}
                value={answers[idx].comment}
                onChange={(e) => set(idx, { comment: e.target.value })}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `comment-${item.id}-error` : undefined}
              />
              {err ? (
                <p id={`comment-${item.id}-error`} className="text-sm text-red-700">
                  {err}
                </p>
              ) : null}
            </div>
          </fieldset>
        );
      })}
      <button type="submit" className={buttonClass} disabled={pending || !complete}>
        {pending ? "Enviando…" : "Enviar mis respuestas"}
      </button>
      {!complete ? <p className="text-sm text-muted">Responde a todas las partidas para poder enviarlas.</p> : null}
      <Message result={result} />
    </form>
  );
}
