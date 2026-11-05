"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";

import { updatePhotos } from "@/app/publicar/actions";
import { compressImage } from "@/lib/images/compress";
import { MAX_PHOTOS } from "@/lib/listings/options";
import { publicStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export function PhotoManager({
  listingId,
  ownerId,
  initialPhotos,
}: {
  listingId: string;
  ownerId: string;
  initialPhotos: string[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function save(next: string[], okText?: string) {
    const previous = photos;
    setPhotos(next);
    startTransition(async () => {
      const result = await updatePhotos(listingId, next);
      if (!result.ok) {
        setPhotos(previous);
        setMessage({ tone: "error", text: result.message ?? "No hemos podido guardar las fotos." });
      } else if (okText) {
        setMessage({ tone: "info", text: okText });
      }
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, room);
    const invalid = selected.find((f) => !ACCEPTED.includes(f.type) || f.size > MAX_INPUT_BYTES);
    if (invalid) {
      setMessage({ tone: "error", text: `«${invalid.name}» no es una imagen JPG, PNG o WebP de menos de 15 MB.` });
      return;
    }

    setUploading(true);
    setMessage({ tone: "info", text: `Subiendo ${selected.length} foto(s)…` });
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      for (const file of selected) {
        const blob = await compressImage(file);
        const path = `${ownerId}/${listingId}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage
          .from("listing-photos")
          .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
        if (error) throw error;
        uploaded.push(path);
      }
      save([...photos, ...uploaded], `${uploaded.length} foto(s) añadida(s).`);
    } catch {
      if (uploaded.length) await supabase.storage.from("listing-photos").remove(uploaded);
      setMessage({ tone: "error", text: "No hemos podido subir alguna foto. Inténtalo de nuevo." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    save(next, `Foto movida a la posición ${index + delta + 1}.`);
  }

  const busy = uploading || pending;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="photos" className="block font-medium">
          Añadir fotos ({photos.length}/{MAX_PHOTOS})
        </label>
        <input
          ref={inputRef}
          id="photos"
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          disabled={busy || photos.length >= MAX_PHOTOS}
          onChange={(e) => onFiles(e.currentTarget.files)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand"
        />
        <p className="text-sm text-muted">
          Hasta {MAX_PHOTOS} fotos. Las reducimos a 1600 px y quitamos los datos de ubicación antes de subirlas. La
          primera es la portada.
        </p>
      </div>

      <p role={message?.tone === "error" ? "alert" : "status"} aria-live="polite" className={message?.tone === "error" ? "text-sm text-red-700 dark:text-red-400" : "text-sm text-muted"}>
        {message?.text}
      </p>

      {photos.length ? (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((path, i) => (
            <li key={path} className="space-y-2 rounded-2xl border border-border bg-background p-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded">
                <Image src={publicStorageUrl("listing-photos", path)} alt={`Foto ${i + 1}`} fill sizes="240px" className="object-cover" />
                {i === 0 ? (
                  <span className="absolute left-1 top-1 rounded bg-background/90 px-2 py-0.5 text-xs font-semibold">Portada</span>
                ) : null}
              </div>
              <div className="flex justify-between gap-1 text-sm">
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="rounded px-2 py-1 hover:bg-brand/10 disabled:opacity-40" aria-label={`Mover la foto ${i + 1} antes`}>
                  ←
                </button>
                <button type="button" disabled={busy} onClick={() => save(photos.filter((p) => p !== path), "Foto eliminada.")} className="rounded px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950" aria-label={`Eliminar la foto ${i + 1}`}>
                  Eliminar
                </button>
                <button type="button" disabled={busy || i === photos.length - 1} onClick={() => move(i, 1)} className="rounded px-2 py-1 hover:bg-brand/10 disabled:opacity-40" aria-label={`Mover la foto ${i + 1} después`}>
                  →
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Aún no hay fotos. Los anuncios con fotos reciben muchas más visitas.
        </p>
      )}
    </div>
  );
}
