import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MyListingActions } from "@/components/listings/my-listing-actions";
import { getCurrentUser } from "@/lib/auth";
import { KIND_LABELS, priceText, STATUS_LABELS, type ListingStatus } from "@/lib/listings/options";
import { getMyListings } from "@/lib/listings/queries";

export const metadata: Metadata = { title: "Mis anuncios", robots: { index: false } };

const STATUS_STYLE: Record<ListingStatus, string> = {
  draft: "bg-border text-foreground",
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  paused: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  closed: "bg-border text-muted",
};

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/mis-anuncios");
  const listings = await getMyListings(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Mis anuncios</h1>
        <Link href="/publicar" className="rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground hover:bg-brand-strong">
          Publicar anuncio
        </Link>
      </div>
      {listings.length ? (
        <ul className="space-y-3">
          {listings.map((l) => (
            <li key={l.id} className="space-y-3 rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{KIND_LABELS[l.kind]}</p>
                  {l.status === "draft" ? (
                    <p className="font-semibold">{l.title || "Borrador sin título"}</p>
                  ) : (
                    <Link href={`/anuncios/${l.id}`} className="font-semibold hover:text-brand">
                      {l.title}
                    </Link>
                  )}
                  <p className="text-sm text-muted">
                    {[l.city, priceText(l)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + STATUS_STYLE[l.status]}>
                  {STATUS_LABELS[l.status]}
                </span>
              </div>
              <MyListingActions id={l.id} status={l.status} title={l.title || "borrador"} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Todavía no has publicado nada.</p>
          <p className="mt-1 text-sm text-muted">Publica una habitación, un piso o cuenta lo que buscas.</p>
        </div>
      )}
    </div>
  );
}
