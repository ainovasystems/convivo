"use client";

import { useActionState, useEffect, useState } from "react";

import { removeAvatar, uploadAvatar } from "@/app/perfil/editar/actions";
import { Avatar } from "@/components/profile/avatar";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/forms";
import { AVATAR_TYPES, avatarFileSchema } from "@/lib/validation/profile";

export function AvatarUploader({ name, path }: { name: string; path: string | null }) {
  const [state, action] = useActionState(uploadAvatar, initialFormState);
  const [removeState, remove] = useActionState(removeAvatar, initialFormState);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (state.status === "success") setPreview(null);
  }, [state]);

  const error = clientError ?? state.errors?.avatar;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- previsualización local (blob:)
          <img
            src={preview}
            alt="Previsualización de tu nueva foto"
            className="size-28 rounded-full border border-border object-cover"
          />
        ) : (
          <Avatar name={name} path={path} size="lg" />
        )}
        {path && !preview ? (
          <form action={remove}>
            <button type="submit" className="text-sm font-medium text-red-700 underline dark:text-red-400">
              Quitar foto
            </button>
          </form>
        ) : null}
      </div>

      <form action={action} className="space-y-3">
        <FormAlert state={state.message ? state : removeState} />
        <div className="space-y-1">
          <label htmlFor="avatar" className="block text-sm font-medium">
            Foto de perfil
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept={AVATAR_TYPES.join(",")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "avatar-error" : "avatar-hint"}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) return;
              const result = avatarFileSchema.safeParse(file);
              if (!result.success) {
                setClientError(result.error.issues[0]?.message ?? "Imagen no válida");
                setPreview(null);
                e.currentTarget.value = "";
                return;
              }
              setClientError(null);
              setPreview(URL.createObjectURL(file));
            }}
          />
          {error ? (
            <p id="avatar-error" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : (
            <p id="avatar-hint" className="text-sm text-muted">
              JPG, PNG o WebP. Máximo 2 MB. Una foto clara de tu cara genera más confianza.
            </p>
          )}
        </div>
        {preview ? <SubmitButton pendingText="Subiendo…">Guardar foto</SubmitButton> : null}
      </form>
    </div>
  );
}
