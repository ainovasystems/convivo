"use client";

import Image from "next/image";
import { useState } from "react";

import { publicStorageUrl } from "@/lib/storage";

const SIZES = "(min-width: 1024px) 700px, 100vw";

/**
 * Galería: foto principal + resto desplazable. Al entrar SOLO se descarga la
 * primera foto (con prioridad: es el elemento más grande de la pantalla); las
 * demás se piden cuando la persona empieza a deslizar, o con el teclado o el
 * foco. Sin JavaScript, el <noscript> las carga igualmente.
 */
export function Gallery({ photos, title, altBase }: { photos: string[]; title: string; altBase: string }) {
  const [all, setAll] = useState(false);
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-brand-soft text-muted">
        El anunciante aún no ha subido fotos
      </div>
    );
  }
  const alt = (i: number) => `${altBase} (foto ${i + 1} de ${photos.length})`;
  const slide = "relative aspect-[4/3] w-full shrink-0 snap-center sm:w-[85%]";
  const reveal = () => setAll(true);
  return (
    <div className="space-y-2">
      <ul
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-3xl"
        aria-label={`Fotos de ${title} (${photos.length})`}
        tabIndex={0}
        onScroll={reveal}
        onTouchStart={reveal}
        onPointerEnter={reveal}
        onFocus={reveal}
        onKeyDown={reveal}
      >
        {photos.map((p, i) => (
          <li key={p} className={`${slide} ${i > 0 && !all ? "gal-ph rounded-3xl bg-brand-soft" : ""}`}>
            {i === 0 || all ? (
              <Image
                src={publicStorageUrl("listing-photos", p)}
                alt={alt(i)}
                fill
                sizes={SIZES}
                className="rounded-3xl object-cover"
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
              />
            ) : null}
          </li>
        ))}
        {photos.length > 1 ? (
          <noscript>
            <style>{".gal-ph{display:none}"}</style>
            {photos.slice(1).map((p, i) => (
              <li key={p} className={slide}>
                <Image
                  src={publicStorageUrl("listing-photos", p)}
                  alt={alt(i + 1)}
                  fill
                  sizes={SIZES}
                  className="rounded-3xl object-cover"
                />
              </li>
            ))}
          </noscript>
        ) : null}
      </ul>
      {photos.length > 1 ? <p className="text-sm text-muted">Desliza para ver las {photos.length} fotos.</p> : null}
    </div>
  );
}
