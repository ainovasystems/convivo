import Image from "next/image";
import Link from "next/link";

import { BedIcon, HomeIcon, PinIcon, UsersIcon } from "@/components/brand/icons";
import type { ListingCardData } from "@/lib/listings/queries";
import { COHABITATION_LABELS, formatShortDate, KIND_LABELS, periodText, priceText } from "@/lib/listings/options";
import { publicStorageUrl } from "@/lib/storage";

const KIND_ICON = { room: BedIcon, flat: HomeIcon, seeking: UsersIcon } as const;

export function ListingCard({
  listing,
  priority = false,
  photoAlt = "",
}: {
  listing: ListingCardData;
  priority?: boolean;
  /** Texto alternativo de la foto. Vacío (decorativa) salvo que la página lo pida. */
  photoAlt?: string;
}) {
  const cover = listing.photos[0];
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  const date = listing.kind === "seeking" ? listing.move_in_date : listing.available_from;
  const KindIcon = KIND_ICON[listing.kind];
  const period = periodText(listing);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-soft">
        {cover ? (
          <Image
            src={publicStorageUrl("listing-photos", cover)}
            alt={photoAlt}
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            priority={priority}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-brand/70" aria-hidden="true">
            <KindIcon className="size-12" />
            <span className="text-sm font-semibold">{listing.kind === "seeking" ? "Busca hogar" : "Sin fotos aún"}</span>
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1 text-xs font-bold text-brand shadow-sm">
          <KindIcon className="size-3.5" />
          {KIND_LABELS[listing.kind]}
        </span>
        {listing.cohabitation !== "any" ? (
          <span className="absolute right-3 top-3 rounded-full bg-background/95 px-3 py-1 text-xs font-bold text-brand shadow-sm">
            {COHABITATION_LABELS[listing.cohabitation]}
          </span>
        ) : null}
        <span className="absolute bottom-3 right-3 rounded-full bg-accent px-3 py-1 text-sm font-extrabold text-accent-foreground shadow-sm">
          {priceText(listing)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-bold leading-snug">
          <Link href={`/anuncios/${listing.id}`} className="after:absolute after:inset-0 focus-visible:outline-2">
            {listing.title}
          </Link>
        </h3>
        {place ? (
          <p className="flex items-center gap-1 text-sm text-muted">
            <PinIcon className="size-4 shrink-0" />
            {place}
          </p>
        ) : null}
        {date || period ? (
          <p className="mt-auto pt-1 text-sm font-medium text-foreground/80">
            {date ? `${listing.kind === "seeking" ? "Entrada" : "Disponible"}: ${formatShortDate(date)}` : null}
            {date && period ? " · " : null}
            {period}
          </p>
        ) : null}
      </div>
    </article>
  );
}
