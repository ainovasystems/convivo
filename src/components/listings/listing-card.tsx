import Image from "next/image";
import Link from "next/link";

import type { ListingCardData } from "@/lib/listings/queries";
import { formatShortDate, KIND_LABELS, priceText } from "@/lib/listings/options";
import { publicStorageUrl } from "@/lib/storage";

export function ListingCard({ listing, priority = false }: { listing: ListingCardData; priority?: boolean }) {
  const cover = listing.photos[0];
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  const date = listing.kind === "seeking" ? listing.move_in_date : listing.available_from;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border hover:border-brand">
      <div className="relative aspect-[4/3] bg-brand/5">
        {cover ? (
          <Image
            src={publicStorageUrl("listing-photos", cover)}
            alt=""
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted" aria-hidden="true">
            Sin fotos
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-brand">
          {KIND_LABELS[listing.kind]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-semibold leading-snug">
          <Link href={`/anuncios/${listing.id}`} className="after:absolute after:inset-0 focus-visible:outline-2">
            {listing.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">{place}</p>
        <p className="mt-auto pt-2 font-semibold">{priceText(listing)}</p>
        {date ? (
          <p className="text-sm text-muted">
            {listing.kind === "seeking" ? "Entrada" : "Disponible"}: {formatShortDate(date)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
