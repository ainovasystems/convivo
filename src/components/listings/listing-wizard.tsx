"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { publishListing, saveListing, type SaveResult } from "@/app/publicar/actions";
import { PhotoManager } from "@/components/listings/photo-manager";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";
import {
  KIND_LABELS,
  nextAcademicYear,
  PROVINCES,
  RENTAL_TERM_LABELS,
  RENTAL_TERMS,
  RULE_KEYS,
  RULE_LABELS,
  type ListingKind,
  type ListingStatus,
  type RentalTerm,
  type RuleKey,
} from "@/lib/listings/options";
import { findCity, KNOWN_CITY_NAMES } from "@/lib/listings/cities";
import { DISCRIMINATION_MESSAGE } from "@/lib/listings/discrimination";
import { listingDraftSchema, publishErrors } from "@/lib/listings/schema";
import { fieldErrors } from "@/lib/validation/profile";

/** Valores del formulario tal como los escribe el usuario (texto). */
export type WizardValues = {
  title: string;
  description: string;
  city: string;
  province: string;
  neighborhood: string;
  monthlyRent: string;
  deposit: string;
  availableFrom: string;
  minStayMonths: string;
  billsIncluded: string; // "" | "yes" | "no"
  furnished: string;
  sizeM2: string;
  bedrooms: string;
  bathrooms: string;
  currentFlatmates: string;
  maxBudget: string;
  zones: string; // separadas por comas
  moveInDate: string;
  rentalTerm: RentalTerm;
  availableUntil: string;
  addressLine: string;
  floorDoor: string;
  postalCode: string;
  rules: Partial<Record<RuleKey, string>>;
};

type Step = "datos" | "fotos" | "revision";

const triToBool = (v: string) => (v === "yes" ? true : v === "no" ? false : null);

/** Texto del formulario -> entrada del esquema Zod (mismo esquema que el servidor). */
export function toDraftInput(v: WizardValues) {
  return {
    title: v.title,
    description: v.description,
    city: v.city,
    province: v.province || null,
    neighborhood: v.neighborhood,
    monthlyRent: v.monthlyRent,
    deposit: v.deposit,
    availableFrom: v.availableFrom,
    minStayMonths: v.minStayMonths,
    billsIncluded: triToBool(v.billsIncluded),
    furnished: triToBool(v.furnished),
    sizeM2: v.sizeM2,
    bedrooms: v.bedrooms,
    bathrooms: v.bathrooms,
    currentFlatmates: v.currentFlatmates,
    maxBudget: v.maxBudget,
    zones: v.zones
      .split(",")
      .map((z) => z.trim())
      .filter(Boolean),
    moveInDate: v.moveInDate,
    rentalTerm: v.rentalTerm,
    availableUntil: v.rentalTerm === "indefinite" ? "" : v.availableUntil,
    rules: Object.fromEntries(
      Object.entries(v.rules)
        .map(([k, val]) => [k, triToBool(val ?? "")])
        .filter(([, val]) => val !== null),
    ),
    address: { addressLine: v.addressLine, floorDoor: v.floorDoor, postalCode: v.postalCode },
  };
}

const YES_NO = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
];

export function ListingWizard({
  listing,
  initialValues,
  initialStep,
}: {
  listing: { id: string; kind: ListingKind; status: ListingStatus; photos: string[]; ownerId: string };
  initialValues: WizardValues;
  initialStep: Step;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isSeeking = listing.kind === "seeking";
  const isDraft = listing.status === "draft";
  const steps: Step[] = isSeeking ? ["datos", "revision"] : ["datos", "fotos", "revision"];
  const [step, setStep] = useState<Step>(steps.includes(initialStep) ? initialStep : "datos");
  const [values, setValues] = useState(initialValues);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<{ tone: "idle" | "saving" | "saved" | "error"; text: string }>({
    tone: "idle",
    text: isDraft ? "Los cambios se guardan solos." : "",
  });
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);

  const parsed = useMemo(() => listingDraftSchema.safeParse(toDraftInput(values)), [values]);
  const fieldErrs = parsed.success ? {} : fieldErrors(parsed.error);
  const missing = parsed.success ? publishErrors(listing.kind, parsed.data) : {};
  // Los textos discriminatorios se marcan mientras se escribe (el resto de lo
  // que falta para publicar se enseña en el paso Revisión).
  const discrimination = Object.fromEntries(
    Object.entries(missing).filter(([, msg]) => msg.startsWith(DISCRIMINATION_MESSAGE)),
  );
  const errors = { ...serverErrors, ...discrimination, ...fieldErrs };

  const set = useCallback(<K extends keyof WizardValues>(key: K, value: WizardValues[K]) => {
    dirty.current = true;
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const handleResult = useCallback((r: SaveResult) => {
    setServerErrors(r.errors ?? {});
    setSaveState(
      r.ok
        ? { tone: "saved", text: "Guardado." }
        : { tone: "error", text: r.message ?? "No se ha podido guardar." },
    );
  }, []);

  // Autoguardado de borradores (con espera de 1 s tras dejar de escribir).
  useEffect(() => {
    if (!isDraft || !dirty.current || !parsed.success) return;
    const t = setTimeout(() => {
      setSaveState({ tone: "saving", text: "Guardando…" });
      saveListing(listing.id, toDraftInput(values)).then(handleResult);
      dirty.current = false;
    }, 1000);
    return () => clearTimeout(t);
  }, [values, isDraft, parsed.success, listing.id, handleResult]);

  function goTo(next: Step) {
    setStep(next);
    router.replace(`${pathname}?paso=${next}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }

  function saveNow() {
    setSaveState({ tone: "saving", text: "Guardando…" });
    startTransition(async () => handleResult(await saveListing(listing.id, toDraftInput(values))));
  }

  function publish() {
    setSaveState({ tone: "saving", text: "Publicando…" });
    startTransition(async () => {
      const r = await publishListing(listing.id, toDraftInput(values));
      if (r && !r.ok) handleResult(r);
    });
  }

  const text = (key: keyof WizardValues & string, label: string, extra: Record<string, unknown> = {}) => (
    <TextField
      id={key}
      label={label}
      value={values[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      error={errors[key]}
      {...extra}
    />
  );
  const tri = (key: "billsIncluded" | "furnished", label: string) => (
    <SelectField id={key} label={label} options={YES_NO} value={values[key]} onChange={(e) => set(key, e.target.value)} />
  );
  const knownCity = findCity(values.city);

  /** Periodo de alquiler. Al elegir "curso" se proponen las fechas del próximo curso. */
  function changeTerm(term: RentalTerm, startKey: "availableFrom" | "moveInDate") {
    dirty.current = true;
    setValues((v) => {
      if (term !== "academic_year") return { ...v, rentalTerm: term };
      const course = nextAcademicYear();
      return { ...v, rentalTerm: term, [startKey]: v[startKey] || course.from, availableUntil: v.availableUntil || course.until };
    });
  }
  const periodFields = (startKey: "availableFrom" | "moveInDate") => (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        id="rentalTerm"
        label={isSeeking ? "¿Para cuánto tiempo?" : "Periodo de alquiler"}
        options={RENTAL_TERMS.map((t) => ({ value: t, label: RENTAL_TERM_LABELS[t] }))}
        placeholder="Elige el periodo"
        value={values.rentalTerm}
        onChange={(e) => changeTerm((e.target.value || "indefinite") as RentalTerm, startKey)}
        hint={values.rentalTerm === "academic_year" ? "Normalmente de septiembre a junio (9-10 meses). Ajusta las fechas si hace falta." : undefined}
      />
      {values.rentalTerm !== "indefinite" ? text("availableUntil", "Hasta (último día)", { type: "date" }) : null}
    </div>
  );

  const stepIndex = steps.indexOf(step);
  const STEP_LABELS: Record<Step, string> = { datos: "Datos", fotos: "Fotos", revision: "Revisión" };

  return (
    <div className="space-y-8">
      <nav aria-label="Pasos">
        <ol className="flex flex-wrap gap-2 text-sm">
          <li className="rounded-full border border-border px-3 py-1 text-muted">1. Tipo: {KIND_LABELS[listing.kind]}</li>
          {steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => goTo(s)}
                aria-current={s === step ? "step" : undefined}
                className={
                  "rounded-full border px-3 py-1 " +
                  (s === step ? "border-brand bg-brand text-brand-foreground" : "border-border hover:border-brand")
                }
              >
                {i + 2}. {STEP_LABELS[s]}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <p
        role={saveState.tone === "error" ? "alert" : "status"}
        aria-live="polite"
        className={"text-sm " + (saveState.tone === "error" ? "text-red-700 dark:text-red-400" : "text-muted")}
      >
        {saveState.text}
      </p>

      {step === "datos" ? (
        <div className="space-y-8">
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold">Lo básico</legend>
            {text("title", "Título", {
              maxLength: 120,
              hint: isSeeking ? "Ej.: Enfermera busca habitación tranquila en Lugo" : "Ej.: Habitación exterior junto a la Muralla",
            })}
            <TextAreaField
              id="description"
              label="Descripción"
              rows={6}
              maxLength={5000}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              error={errors.description}
              hint="Mínimo 30 caracteres. No incluyas teléfonos ni datos de pago, ni requisitos sobre origen, religión o similares."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {text("city", "Ciudad", { maxLength: 80, list: "known-cities", autoComplete: "off" })}
              <datalist id="known-cities">
                {KNOWN_CITY_NAMES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <SelectField
                id="province"
                label="Provincia"
                options={PROVINCES.map((p) => ({ value: p, label: p }))}
                placeholder="Elige provincia"
                value={knownCity ? knownCity.province : values.province}
                onChange={(e) => set("province", e.target.value)}
                disabled={Boolean(knownCity)}
                hint={knownCity ? `Se rellena sola: ${knownCity.name} está en la provincia de ${knownCity.province}.` : undefined}
                error={knownCity ? undefined : errors.province}
              />
            </div>
            {!isSeeking ? text("neighborhood", "Barrio o zona", { maxLength: 120, hint: "Se muestra en el anuncio. La dirección exacta, no." }) : null}
          </fieldset>

          {isSeeking ? (
            <fieldset className="space-y-4">
              <legend className="text-lg font-semibold">Lo que buscas</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {text("maxBudget", "Presupuesto máximo (€/mes)", { type: "number", inputMode: "numeric", min: 50 })}
                {text("moveInDate", "Fecha de entrada", { type: "date" })}
              </div>
              {periodFields("moveInDate")}
              {text("zones", "Zonas que te interesan", { hint: "Separadas por comas. Ej.: Centro, Milagrosa" })}
            </fieldset>
          ) : (
            <>
              <fieldset className="space-y-4">
                <legend className="text-lg font-semibold">Precio y disponibilidad</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("monthlyRent", "Precio (€/mes)", { type: "number", inputMode: "numeric", min: 50 })}
                  {text("deposit", "Fianza (€)", { type: "number", inputMode: "numeric", min: 0 })}
                  {text("availableFrom", "Disponible desde", { type: "date" })}
                  {text("minStayMonths", "Estancia mínima (meses)", { type: "number", inputMode: "numeric", min: 1 })}
                  {tri("billsIncluded", "¿Gastos incluidos?")}
                  {tri("furnished", "¿Amueblado?")}
                </div>
                {periodFields("availableFrom")}
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="text-lg font-semibold">La vivienda</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("sizeM2", "Superficie (m²)", { type: "number", inputMode: "numeric" })}
                  {text("bedrooms", "Habitaciones", { type: "number", inputMode: "numeric", min: 0 })}
                  {text("bathrooms", "Baños", { type: "number", inputMode: "numeric", min: 0 })}
                  {listing.kind === "room"
                    ? text("currentFlatmates", "Compañeros actuales", { type: "number", inputMode: "numeric", min: 0 })
                    : null}
                </div>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="text-lg font-semibold">Normas de la casa</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {RULE_KEYS.map((k) => (
                    <SelectField
                      key={k}
                      id={`rule-${k}`}
                      label={RULE_LABELS[k].question}
                      options={YES_NO}
                      value={values.rules[k] ?? ""}
                      onChange={(e) => set("rules", { ...values.rules, [k]: e.target.value })}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="text-lg font-semibold">Dirección exacta (privada)</legend>
                <p className="text-sm text-muted">
                  Solo la verán las personas cuyo interés aceptes. En el anuncio público se muestra el barrio.
                </p>
                {text("addressLine", "Calle y número", { maxLength: 200, autoComplete: "street-address", error: errors["address.addressLine"] })}
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("floorDoor", "Piso y puerta", { maxLength: 40, error: errors["address.floorDoor"] })}
                  {text("postalCode", "Código postal", { inputMode: "numeric", maxLength: 5, autoComplete: "postal-code", error: errors["address.postalCode"] })}
                </div>
              </fieldset>
            </>
          )}
        </div>
      ) : null}

      {step === "fotos" ? (
        <PhotoManager listingId={listing.id} ownerId={listing.ownerId} initialPhotos={listing.photos} />
      ) : null}

      {step === "revision" ? (
        <section aria-labelledby="revision" className="space-y-4">
          <h2 id="revision" className="text-lg font-semibold">
            Revisión
          </h2>
          {Object.keys(missing).length || Object.keys(fieldErrs).length ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-medium">Antes de {isDraft ? "publicar" : "guardar"} falta:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {Object.entries({ ...fieldErrs, ...missing }).map(([k, msg]) => (
                  <li key={k}>
                    <button type="button" className="underline" onClick={() => goTo("datos")}>
                      {msg}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              Todo listo. {isDraft ? "Al publicar, tu anuncio aparecerá en las búsquedas." : "Guarda para aplicar los cambios."}
            </p>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Título</dt>
              <dd className="font-medium">{values.title || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Ubicación</dt>
              <dd className="font-medium">{[...new Set([values.neighborhood, knownCity?.name ?? values.city, knownCity?.province ?? values.province].filter(Boolean))].join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Periodo</dt>
              <dd className="font-medium">
                {RENTAL_TERM_LABELS[values.rentalTerm]}
                {values.rentalTerm !== "indefinite" && values.availableUntil ? ` (hasta el ${values.availableUntil.split("-").reverse().join("/")})` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{isSeeking ? "Presupuesto" : "Precio"}</dt>
              <dd className="font-medium">{(isSeeking ? values.maxBudget : values.monthlyRent) ? `${isSeeking ? values.maxBudget : values.monthlyRent} €/mes` : "—"}</dd>
            </div>
            {!isSeeking ? (
              <div>
                <dt className="text-muted">Fotos</dt>
                <dd className="font-medium">{listing.photos.length ? "Gestionadas en el paso Fotos" : "Sin fotos"}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-3">
            {isDraft ? (
              <button type="button" className={buttonClass} disabled={pending || Object.keys(missing).length > 0 || !parsed.success} onClick={publish}>
                {pending ? "Publicando…" : "Publicar anuncio"}
              </button>
            ) : (
              <button type="button" className={buttonClass} disabled={pending || Object.keys(missing).length > 0 || !parsed.success} onClick={saveNow}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
            <Link href="/mis-anuncios" className="rounded-full px-3 py-2.5 font-semibold text-brand underline">
              {isDraft ? "Seguir más tarde" : "Volver a mis anuncios"}
            </Link>
          </div>
        </section>
      ) : null}

      <div className="flex justify-between border-t border-border pt-4">
        {stepIndex > 0 ? (
          <button type="button" onClick={() => goTo(steps[stepIndex - 1])} className="rounded-full px-4 py-2 font-semibold hover:bg-brand-soft hover:text-brand">
            ← Atrás
          </button>
        ) : (
          <span />
        )}
        {stepIndex < steps.length - 1 ? (
          <button type="button" onClick={() => goTo(steps[stepIndex + 1])} className={buttonClass}>
            Siguiente →
          </button>
        ) : null}
      </div>
    </div>
  );
}
