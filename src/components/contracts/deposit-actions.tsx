"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmKeys,
  declareKeys,
  markReturned,
  recordDeposit,
  respondReturn,
  type DepositResult,
} from "@/app/contratos/[id]/fianza/actions";
import { inputClass, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";

/** Ejecuta una acción de la fianza y refresca la página con lo que confirmó el servidor. */
function useDepositAction() {
  const router = useRouter();
  const [result, setResult] = useState<DepositResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<DepositResult>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });
  return { result, pending, run };
}

function Message({ result }: { result: DepositResult | null }) {
  if (!result?.message) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={"text-sm " + (result.ok ? "text-emerald-800" : "text-red-700")}>
      {result.message}
    </p>
  );
}

/** El casero anota el depósito: fecha, número de resguardo y, opcional, el documento. */
export function RecordDepositForm({ contractId, today }: { contractId: string; today: string }) {
  const { result, pending, run } = useDepositAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => recordDeposit(contractId, data));
      }}
    >
      <TextField id="deposited_on" label="Fecha del depósito" type="date" max={today} required error={result?.errors?.deposited_on} />
      <TextField id="receipt_number" label="Número de resguardo" maxLength={60} required autoComplete="off" error={result?.errors?.receipt_number} />
      <div className="space-y-1">
        <label htmlFor="receipt" className="block text-sm font-semibold">
          Resguardo (opcional)
        </label>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className={inputClass}
          aria-invalid={result?.errors?.receipt ? true : undefined}
          aria-describedby={result?.errors?.receipt ? "receipt-error" : "receipt-hint"}
        />
        {result?.errors?.receipt ? (
          <p id="receipt-error" className="text-sm text-red-700">
            {result.errors.receipt}
          </p>
        ) : (
          <p id="receipt-hint" className="text-sm text-muted">
            PDF o imagen, hasta 2,5 MB. Solo lo ves tú: tu inquilino ve únicamente la fecha y el número.
          </p>
        )}
      </div>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Anotar el depósito"}
      </button>
      <Message result={result} />
    </form>
  );
}

/** Una fecha y un botón: declarar la entrega de llaves (inquilino) o marcar la devolución (casero). */
export function DateActionForm({
  contractId,
  action,
  label,
  button,
  today,
  hint,
  min,
  withAmount,
}: {
  contractId: string;
  action: "keys" | "return";
  label: string;
  button: string;
  today: string;
  hint?: string;
  min?: string;
  /** Pide también el importe devuelto (solo al marcar la devolución; opcional e informativo). */
  withAmount?: boolean;
}) {
  const { result, pending, run } = useDepositAction();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const id = `fianza-${action}-date`;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (action === "keys" ? declareKeys(contractId, date) : markReturned(contractId, date, amount)));
      }}
    >
      <TextField id={id} label={label} type="date" min={min} max={today} required value={date} onChange={(e) => setDate(e.target.value)} hint={hint} error={result?.errors?.date} />
      {withAmount ? (
        <TextField
          id="fianza-return-amount"
          name="amount"
          label="Importe devuelto en € (opcional)"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint="Informativo: Convivo no mueve dinero ni comprueba el importe."
          error={result?.errors?.amount}
        />
      ) : null}
      <button type="submit" className={buttonClass} disabled={pending || !date}>
        {pending ? "Guardando…" : button}
      </button>
      <Message result={result} />
    </form>
  );
}

export function ConfirmKeysButton({ contractId }: { contractId: string }) {
  const { result, pending, run } = useDepositAction();
  return (
    <div className="space-y-2">
      <button type="button" className={buttonClass} disabled={pending} onClick={() => run(() => confirmKeys(contractId))}>
        {pending ? "Confirmando…" : "Confirmar la entrega de llaves"}
      </button>
      <Message result={result} />
    </div>
  );
}

export function RespondReturn({ contractId }: { contractId: string }) {
  const { result, pending, run } = useDepositAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={pending} onClick={() => run(() => respondReturn(contractId, true))}>
          He recibido la fianza
        </button>
        <button
          type="button"
          className="rounded-full border border-red-700 px-5 py-2.5 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
          disabled={pending}
          onClick={() => {
            if (window.confirm("¿Confirmas que NO has recibido la fianza? Tu casero lo verá y podrá volver a marcarla.")) run(() => respondReturn(contractId, false));
          }}
        >
          No la he recibido
        </button>
      </div>
      <Message result={result} />
    </div>
  );
}
