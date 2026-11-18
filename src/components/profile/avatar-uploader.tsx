"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/profile/avatar";
import { AVATAR_TYPES, avatarFileSchema } from "@/lib/validation/profile";

/**
 * Foto de perfil DENTRO del formulario del perfil: se elige aquí y se guarda con
 * «Guardar perfil», como el resto (auditoría I7; antes tenía su propio botón y
 * «Guardar perfil» decía «Perfil guardado» sin guardar la foto).
 *
 * - `serverError`: lo que respondió el servidor sobre la foto.
 * - `onValidity`: avisa al formulario de si la foto elegida vale, para no enviarlo si no.
 * - `savedKey`: cambia cuando el servidor confirma el guardado; entonces se quita la vista previa.
 * - `removeFormId`: formulario aparte (no se pueden anidar) que quita la foto actual.
 */
export function AvatarField({
  name,
  path,
  serverError,
  onValidity,
  savedKey,
  removeFormId,
}: {
  name: string;
  path: string | null;
  serverError?: string;
  onValidity: (error: string | null) => void;
  savedKey: number;
  removeFormId: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  // Guardado: la foto nueva ya viene del servidor; se limpia la elegida.
  useEffect(() => {
    if (savedKey === 0) return;
    setPreview(null);
    setPicked(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [savedKey]);

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setPicked(false);
    setClientError(null);
    onValidity(null);
  }

  const error = clientError ?? serverError;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- previsualización local (blob:)
          <img src={preview} alt="Previsualización de tu nueva foto" className="size-28 rounded-full border border-border object-cover" />
        ) : (
          <Avatar name={name} path={path} size="lg" />
        )}
        {path && !picked ? (
          <button type="submit" form={removeFormId} className="text-sm font-medium text-red-700 underline dark:text-red-400">
            Quitar foto
          </button>
        ) : null}
        {picked ? (
          <button type="button" onClick={clear} className="text-sm font-medium text-brand underline">
            No cambiar la foto
          </button>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="avatar" className="block text-sm font-medium">
          Foto de perfil
        </label>
        <input
          ref={inputRef}
          id="avatar"
          name="avatar"
          type="file"
          accept={AVATAR_TYPES.join(",")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "avatar-error" : "avatar-hint"}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return clear();
            setPicked(true);
            const result = avatarFileSchema.safeParse(file);
            if (!result.success) {
              // El fichero sigue elegido y marcado en rojo: el formulario no se envía hasta cambiarlo o quitarlo.
              const message = result.error.issues[0]?.message ?? "Imagen no válida";
              setClientError(message);
              setPreview(null);
              onValidity(message);
              return;
            }
            setClientError(null);
            onValidity(null);
            setPreview(URL.createObjectURL(file));
          }}
        />
        {error ? (
          <p id="avatar-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : (
          <p id="avatar-hint" className="text-sm text-muted">
            {picked
              ? "Se guardará al pulsar «Guardar perfil»."
              : "JPG, PNG o WebP. Máximo 2 MB. Una foto clara de tu cara genera más confianza."}
          </p>
        )}
      </div>
    </div>
  );
}
