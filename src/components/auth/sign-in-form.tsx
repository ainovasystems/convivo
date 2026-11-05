"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { sendMagicLink, signInWithPassword } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { useClientValidation } from "@/lib/use-client-validation";
import { magicLinkSchema, signInSchema } from "@/lib/validation/auth";

type Mode = "password" | "magic";

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Forma de entrar" className="grid grid-cols-2 rounded-full border border-border p-1 text-sm">
        {(
          [
            ["password", "Con contraseña"],
            ["magic", "Con enlace por email"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={mode === value}
            aria-controls={`panel-${value}`}
            onClick={() => setMode(value)}
            className={
              "rounded-full px-3 py-2 font-semibold focus-visible:outline-2 " +
              (mode === value ? "bg-background text-brand shadow-[var(--shadow-card)]" : "text-muted hover:text-brand")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
        {mode === "password" ? <PasswordForm next={next} /> : <MagicLinkForm next={next} />}
      </div>
    </div>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInWithPassword, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(signInSchema);
  const errors = { ...state.errors, ...clientErrors };

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert state={state} />
      <TextField id="email" label="Email" type="email" autoComplete="email" required error={errors.email} />
      <TextField
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
      <p className="text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-brand underline">
          Regístrate
        </Link>
      </p>
    </form>
  );
}

function MagicLinkForm({ next }: { next: string }) {
  const [state, action] = useActionState(sendMagicLink, initialFormState);
  const { clientErrors, onSubmit } = useClientValidation(magicLinkSchema);
  const errors = { ...state.errors, ...clientErrors };

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert state={state} />
      <p className="text-sm text-muted">Te enviamos un enlace de un solo uso para entrar sin contraseña.</p>
      <TextField id="email" label="Email" type="email" autoComplete="email" required error={errors.email} />
      <SubmitButton pendingText="Enviando…">Enviarme el enlace</SubmitButton>
    </form>
  );
}
