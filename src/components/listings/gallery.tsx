import Image from "next/image";

import { publicStorageUrl } from "@/lib/storage";

/** Galería: foto principal + miniaturas desplazables (sin JS). */
export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-brand-soft text-muted">
        El anunciante aún no ha subido fotos
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-3xl"
        aria-label={`Fotos de ${title} (${photos.length})`}
        tabIndex={0}
      >
        {photos.map((p, i) => (
          <li key={p} className="relative aspect-[4/3] w-full shrink-0 snap-center sm:w-[85%]">
            <Image
              src={publicStorageUrl("listing-photos", p)}
              alt={`Foto ${i + 1} de ${photos.length}`}
              fill
              sizes="(min-width: 1024px) 700px, 100vw"
              className="rounded-3xl object-cover"
              priority={i === 0}
            />
          </li>
        ))}
      </ul>
      {photos.length > 1 ? <p className="text-sm text-muted">Desliza para ver las {photos.length} fotos.</p> : null}
    </div>
  );
}
