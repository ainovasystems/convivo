"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { removeAvatar, updateProfile } from "@/app/perfil/editar/actions";
import { AvatarField } from "@/components/profile/avatar-uploader";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";
import { initialFormState, SESSION_EXPIRED_MESSAGE } from "@/lib/forms";
import {
  CLEANLINESS_LABELS,
  GUESTS,
  GUESTS_LABELS,
  LANGUAGES,
  NOISE_LABELS,
  ROLE_LABELS,
  SCHEDULE_LABELS,
  SCHEDULES,
  USER_ROLES,
  type Habits,
  maxBirthYear,
} from "@/lib/profile/options";
import { SensitiveDataNotice } from "@/components/moderation/sensitive-data-notice";
import { personalDataError } from "@/lib/moderation/personal-data";
import { useClientValidation } from "@/lib/use-client-validation";
import { profileFormDataToObject, profileSchema } from "@/lib/validation/profile";

export type ProfileFormValues = {
  id: string;
  avatarPath: string | null;
  displayName: string;
  bio: string | null;
  city: string | null;
  occupation: string | null;
  birthYear: number | null;
  languages: string[];
  roles: string[];
  habits: Habits;
};

const YES_NO = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
];
const toYesNo = (v: boolean | undefined) => (v === undefined ? "" : v ? "yes" : "no");
const scale = (labels: Record<number, string>) =>
  [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: labels[n].replace(/^.*?: /, "") }));

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  const [removeState, remove] = useActionState(removeAvatar, initialFormState);
  const { clientErrors, onSubmit: validate } = useClientValidation(profileSchema, profileFormDataToObject);
  const [bioLive, setBioLive] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedKey, setSavedKey] = useState(0);
  const avatarRef = useRef<HTMLDivElement>(null);
  const errors = { ...state.errors, ...clientErrors };

  useEffect(() => {
    if (state.status === "success") setSavedKey((k) => k + 1);
  }, [state]);

  // El formulario se envía «a mano» (no con `action=`): así React no lo vacía al
  // terminar, y si algo falla (la sesión caducada, un campo mal, la foto) lo que se
  // había escrito sigue en la pantalla (auditoría I3).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    validate(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (avatarError) {
      // Foto elegida que no vale: no se envía nada (y no sale «Perfil guardado»).
      setBlocked(true);
      avatarRef.current?.scrollIntoView({ block: "center" });
      return;
    }
    setBlocked(false);
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  const alert = blocked
    ? { status: "error" as const, message: "No se ha guardado: la foto elegida no vale. Cámbiala o pulsa «No cambiar la foto»." }
    : state.message
      ? state
      : removeState;
  const sessionExpired = !blocked && state.message === SESSION_EXPIRED_MESSAGE;

  return (
    <>
    {/* Formulario aparte para «Quitar foto» (no se pueden anidar formularios). */}
    <form id="remove-avatar" action={remove} className="hidden" />
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <FormAlert state={alert} />
      {sessionExpired ? (
        <p className="text-sm">
          Lo que has escrito sigue aquí.{" "}
          <a href="/entrar?next=/perfil/editar" target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
            Entra en otra pestaña
          </a>{" "}
          y vuelve a pulsar «Guardar perfil».
        </p>
      ) : null}

      <div ref={avatarRef}>
        <AvatarField
          name={initial.displayName}
          path={initial.avatarPath}
          serverError={state.errors?.avatar}
          onValidity={(e) => {
            setAvatarError(e);
            if (!e) setBlocked(false);
          }}
          savedKey={savedKey}
          removeFormId="remove-avatar"
        />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Datos básicos</legend>
        <TextField
          id="displayName"
          label="Nombre"
          required
          maxLength={60}
          defaultValue={initial.displayName}
          error={errors.displayName}
        />
        <TextAreaField
          id="bio"
          label="Sobre ti"
          rows={5}
          maxLength={1000}
          defaultValue={initial.bio ?? ""}
          onChange={(e) => setBioLive(personalDataError(e.currentTarget.value, "profile"))}
          hint="Cuéntales a tus futuros compañeros cómo eres en casa (máx. 1000 caracteres). No incluyas teléfonos, emails ni direcciones exactas: usa el chat."
          error={bioLive ?? errors.bio}
        />
        <SensitiveDataNotice />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="city"
            label="Ciudad"
            autoComplete="address-level2"
            maxLength={80}
            defaultValue={initial.city ?? ""}
            error={errors.city}
          />
          <TextField
            id="occupation"
            label="Ocupación"
            maxLength={80}
            defaultValue={initial.occupation ?? ""}
            hint="Por ejemplo: estudiante de Enfermería, diseñadora…"
            error={errors.occupation}
          />
        </div>
        <TextField
          id="birthYear"
          label="Año de nacimiento"
          type="number"
          inputMode="numeric"
          min={new Date().getFullYear() - 110}
          max={maxBirthYear()}
          defaultValue={initial.birthYear ?? ""}
          hint="En tu perfil se muestra tu edad, no el año."
          error={errors.birthYear}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">¿Cómo usas Hommie?</legend>
        <div className="flex flex-wrap gap-3">
          {USER_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 rounded-full border border-border px-3 py-2">
              <input
                type="checkbox"
                name="roles"
                value={role}
                defaultChecked={initial.roles.includes(role)}
                className="size-4 accent-[var(--brand)]"
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Idiomas</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(LANGUAGES).map(([code, label]) => (
            <label key={code} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="languages"
                value={code}
                defaultChecked={initial.languages.includes(code)}
                className="size-4 accent-[var(--brand)]"
              />
              {label}
            </label>
          ))}
        </div>
        {errors.languages ? <p className="text-sm text-red-700 dark:text-red-400">{errors.languages}</p> : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Hábitos de convivencia</legend>
        <p className="text-sm text-muted">
          Todo es opcional. Sirve para que encuentres gente compatible, nunca para discriminar.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="smoker" label="¿Fumas?" options={YES_NO} defaultValue={toYesNo(initial.habits.smoker)} />
          <SelectField
            id="pets"
            label="¿Tienes mascotas?"
            options={YES_NO}
            defaultValue={toYesNo(initial.habits.pets)}
          />
          <SelectField
            id="schedule"
            label="Horarios"
            options={SCHEDULES.map((s) => ({ value: s, label: SCHEDULE_LABELS[s] }))}
            defaultValue={initial.habits.schedule ?? ""}
          />
          <SelectField
            id="guests"
            label="Visitas en casa"
            options={GUESTS.map((g) => ({ value: g, label: GUESTS_LABELS[g].replace("Visitas: ", "") }))}
            defaultValue={initial.habits.guests ?? ""}
          />
          <SelectField
            id="cleanliness"
            label="Nivel de limpieza"
            options={scale(CLEANLINESS_LABELS)}
            defaultValue={initial.habits.cleanliness ? String(initial.habits.cleanliness) : ""}
          />
          <SelectField
            id="noise"
            label="Ruido"
            options={scale(NOISE_LABELS)}
            defaultValue={initial.habits.noise ? String(initial.habits.noise) : ""}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">Verificaciones</legend>
        <p className="text-sm text-muted">
          Tu email se verifica al confirmar la cuenta. {/* TODO(teléfono): verificación por SMS pendiente. */}
          La verificación por teléfono llegará pronto. Nunca te pediremos el DNI.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonClass} disabled={pending} aria-disabled={pending}>
          {pending ? "Guardando…" : "Guardar perfil"}
        </button>
        <Link href={`/perfil/${initial.id}`} className="font-medium text-brand underline">
          Ver mi perfil público
        </Link>
      </div>
    </form>
    </>
  );
}
