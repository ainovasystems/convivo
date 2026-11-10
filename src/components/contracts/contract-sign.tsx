"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelContract, signContract, type ContractResult } from "@/app/contratos/actions";
import { TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";

export function ContractSign({
  contractId,
  hash,
  expectedName,
  canSign,
}: {
  contractId: string;
  hash: string;
  expectedName: string;
  canSign: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [accept, setAccept] = useState(false);
  const [result, setResult] = useState<ContractResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ContractResult>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-4 rounded-3xl border-2 border-brand/30 bg-brand-soft/40 p-5 print:hidden">
      {canSign ? (
        <>
          <h2 className="text-lg font-bold">Firmar el contrato</h2>
          <TextField
            id="fullName"
            label="Escribe tu nombre completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            hint={`Tal como aparece en el contrato: ${expectedName}`}
            autoComplete="name"
            error={result?.errors?.fullName}
          />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
            He leído el contrato completo y acepto firmarlo. Entiendo que esta firma electrónica me obliga igual que una firma a mano.
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={pending}
            onClick={() => run(() => signContract(contractId, { fullName, hash, accept }))}
          >
            {pending ? "Firmando…" : "Firmar"}
          </button>
        </>
      ) : (
        <p className="font-semibold">Ya has firmado. Falta que firme la otra parte.</p>
      )}
      {result?.message ? (
        <p role={result.ok ? "status" : "alert"} className={"text-sm " + (result.ok ? "text-emerald-800" : "text-red-700")}>
          {result.message}
        </p>
      ) : null}
      <button
        type="button"
        className="text-sm font-semibold text-red-700 underline"
        disabled={pending}
        onClick={() => {
          if (window.confirm("¿Cancelar este contrato? La otra parte recibirá un aviso.")) run(() => cancelContract(contractId));
        }}
      >
        Cancelar el contrato
      </button>
    </div>
  );
}
