"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { cancelContract, saveContractDraft, sendContract, type ContractResult } from "@/app/contratos/actions";
import { ContractText } from "@/components/contracts/contract-text";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";
import {
  CONTRACT_KIND_LABELS,
  CONTRACT_KINDS,
  contractKindErrors,
  contractTermsSchema,
  contractWarnings,
  type ContractKind,
} from "@/lib/contracts/schema";
import { contractToText, renderContract } from "@/lib/contracts/templates";
import { fieldErrors } from "@/lib/validation/profile";

type Values = Record<string, string | boolean>;

const asString = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function ContractEditor({
  contractId,
  listingKind,
  initialKind,
  initialTerms,
  meta,
}: {
  contractId: string;
  listingKind: "room" | "flat";
  initialKind: ContractKind;
  initialTerms: Record<string, unknown>;
  meta: { city: string | null; landlordId: string; tenantId: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ContractKind>(initialKind);
  const [v, setV] = useState<Values>(() => ({
    landlord_name: asString(initialTerms.landlord_name),
    tenant_name: asString(initialTerms.tenant_name),
    address: asString(initialTerms.address),
    room_description: asString(initialTerms.room_description),
    monthly_rent: asString(initialTerms.monthly_rent),
    deposit: asString(initialTerms.deposit),
    payment_day: asString(initialTerms.payment_day || 5),
    start_date: asString(initialTerms.start_date),
    end_date: asString(initialTerms.end_date),
    bills_included: Boolean(initialTerms.bills_included),
    bills_note: asString(initialTerms.bills_note),
    furnished: initialTerms.furnished !== false,
    seasonal_reason: asString(initialTerms.seasonal_reason),
    house_rules: asString(initialTerms.house_rules),
    extra_clauses: asString(initialTerms.extra_clauses),
  }));
  const [result, setResult] = useState<ContractResult | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(() => contractTermsSchema.safeParse(v), [v]);
  const errors = { ...(parsed.success ? contractKindErrors(kind, parsed.data) : fieldErrors(parsed.error)), ...(result?.errors ?? {}) };
  const warnings = parsed.success ? contractWarnings(kind, parsed.data) : [];
  const preview = parsed.success
    ? contractToText(renderContract(kind, parsed.data, { ...meta, contractId }))
    : null;
  const kinds = CONTRACT_KINDS.filter((k) => (listingKind === "room" ? k === "room" : k !== "room"));

  const set = (key: string, value: string | boolean) => {
    setResult(null);
    setV((old) => ({ ...old, [key]: value }));
  };
  const text = (key: string, label: string, extra: Record<string, unknown> = {}) => (
    <TextField id={key} label={label} value={v[key] as string} onChange={(e) => set(key, e.target.value)} error={errors[key]} {...extra} />
  );
  const payload = () => ({ kind, terms: v });
  const run = (fn: () => Promise<ContractResult>, refresh = false) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok && refresh) router.refresh();
    });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
        <SelectField
          id="kind"
          label="Tipo de contrato"
          options={kinds.map((k) => ({ value: k, label: CONTRACT_KIND_LABELS[k] }))}
          placeholder="Elige el tipo"
          value={kind}
          onChange={(e) => setKind((e.target.value || kinds[0]) as ContractKind)}
          hint={listingKind === "flat" ? "Temporada si es por un motivo concreto y fechas cerradas (por ejemplo, un curso universitario)." : undefined}
        />
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Las partes</legend>
          {text("landlord_name", "Tu nombre y apellidos (parte arrendadora)", { autoComplete: "name", hint: "Tal como figuran en tu documento de identidad." })}
          {text("tenant_name", "Nombre y apellidos de la parte arrendataria", { hint: "Confírmalo con la otra persona: tendrá que escribirlo igual para firmar." })}
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">La vivienda</legend>
          {text("address", "Dirección completa", { hint: "Calle, número, piso, código postal y ciudad." })}
          {listingKind === "room" ? text("room_description", "Qué habitación (opcional)", { hint: "Por ejemplo: la habitación exterior con balcón." }) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.furnished as boolean} onChange={(e) => set("furnished", e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Amueblada
          </label>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Dinero y fechas</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("monthly_rent", "Renta (€/mes)", { type: "number", inputMode: "numeric", min: 1 })}
            {text("deposit", "Fianza (€)", { type: "number", inputMode: "numeric", min: 0 })}
            {text("payment_day", "Pagar antes del día", { type: "number", inputMode: "numeric", min: 1, max: 28 })}
            {text("start_date", "Entrada", { type: "date" })}
            {text("end_date", kind === "flat_habitual" ? "Fin (opcional)" : "Fin", { type: "date" })}
          </div>
          {kind === "flat_seasonal"
            ? text("seasonal_reason", "Motivo de la temporada", { hint: "Por ejemplo: estudios universitarios durante el curso 2027/28." })
            : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.bills_included as boolean} onChange={(e) => set("bills_included", e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Gastos de suministros incluidos en la renta
          </label>
          {text("bills_note", "Detalle de los gastos (opcional)", { hint: "Por ejemplo: luz y gas a partes iguales entre los compañeros." })}
          {warnings.map((w) => (
            <p key={w} role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {w}
            </p>
          ))}
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Normas y cláusulas</legend>
          <TextAreaField id="house_rules" label="Normas de convivencia" rows={3} maxLength={2000} value={v.house_rules as string} onChange={(e) => set("house_rules", e.target.value)} error={errors.house_rules} />
          <TextAreaField
            id="extra_clauses"
            label="Cláusulas adicionales (opcional)"
            rows={4}
            maxLength={3000}
            value={v.extra_clauses as string}
            onChange={(e) => set("extra_clauses", e.target.value)}
            error={errors.extra_clauses}
            hint="Solo lo que hayáis acordado. No pueden ir contra la ley ni contra los derechos del inquilino."
          />
        </fieldset>

        {result?.message ? (
          <p role={result.ok ? "status" : "alert"} className={"text-sm " + (result.ok ? "text-emerald-800" : "text-red-700")}>
            {result.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass} disabled={pending || !preview} onClick={() => run(() => sendContract(contractId, payload()), true)}>
            {pending ? "Enviando…" : "Enviar para firmar"}
          </button>
          <button
            type="button"
            className="rounded-full border border-border px-5 py-3 font-semibold hover:border-brand"
            disabled={pending}
            onClick={() => run(() => saveContractDraft(contractId, payload()))}
          >
            Guardar borrador
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-3 text-sm font-semibold text-red-700 underline"
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Descartar este borrador?")) run(() => cancelContract(contractId), true);
            }}
          >
            Descartar
          </button>
        </div>
        <p className="text-xs text-muted">
          Al enviarlo, el texto queda cerrado: si luego hay que cambiar algo, se cancela y se prepara otro.
        </p>
      </form>

      <section aria-label="Vista previa" className="space-y-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <h2 className="text-sm font-semibold text-muted">Vista previa</h2>
        {preview ? <ContractText text={preview} /> : <p className="text-sm text-muted">Completa los datos para ver el contrato.</p>}
      </section>
    </div>
  );
}
