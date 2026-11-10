import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { InterestForm } from "@/components/conversations/interest-form";
import { Gallery } from "@/components/listings/gallery";
import { Avatar } from "@/components/profile/avatar";
import { ReviewCard } from "@/components/profile/review-card";
import { Chip } from "@/components/ui/chip";
import { Rating } from "@/components/ui/rating";
import { getCurrentUser } from "@/lib/auth";
import { getMyInterestForListing } from "@/lib/conversations/queries";
import { INTEREST_STATUS_LABELS } from "@/lib/conversations/state";
import {
  formatEuros,
  formatShortDate,
  KIND_LABELS,
  priceText,
  COHABITATION_LABELS,
  RENTAL_TERM_LABELS,
  RULE_KEYS,
  RULE_LABELS,
  STATUS_LABELS,
} from "@/lib/listings/options";
import { getListingDetail } from "@/lib/listings/queries";
import { JsonLdScript } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, listingJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata, shareablePhotoUrl, shorten } from "@/lib/seo/metadata";
import { getBaseUrl } from "@/lib/seo/site";
import { publicStorageUrl } from "@/lib/storage";
import { CRITERIA_LABELS, formatMonth, formatRating, overallRating } from "@/lib/reviews/labels";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const idSchema = z.uuid();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return {};
  const detail = await getListingDetail(id);
  if (!detail) return {};
  const l = detail.listing;
  const baseUrl = await getBaseUrl();
  const place = [l.neighborhood, l.city].filter(Boolean).join(", ");
  const cover = l.photos[0];
  // «Busco» y los anuncios no activos no se indexan (son personas o ya no existen).
  const indexable = l.status === "active" && l.kind !== "seeking";
  return pageMetadata({
    baseUrl,
    title: l.title,
    // El precio va primero: es lo que se ve en la tarjeta de WhatsApp y en Google.
    description: shorten(`${priceText(l)} · ${KIND_LABELS[l.kind]} en ${place}. ${l.description}`, 200),
    path: `/anuncios/${l.id}`,
    // Con foto, la propia foto; sin ella (o «busco»), una tarjeta con título y precio.
    image: cover ? shareablePhotoUrl(baseUrl, publicStorageUrl("listing-photos", cover)) : `/og/anuncios/${l.id}`,
    imageSized: !cover,
    imageAlt: cover ? `${KIND_LABELS[l.kind]} en ${place}` : l.title,
    robots: indexable ? undefined : { index: false, follow: false },
  });
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [detail, viewer, sp] = await Promise.all([getListingDetail(id), getCurrentUser(), searchParams]);
  if (!detail) notFound();
  const myInterest =
    viewer && viewer.id !== detail.listing.owner_id ? await getMyInterestForListing(id, viewer.id) : null;

  const { listing: l, address, stats, reviews, ownerStats } = detail;
  const isOwner = viewer?.id === l.owner_id;
  const owner = l.owner;
  const ownerRating = overallRating(ownerStats);
  const place = [l.neighborhood, l.city, l.province].filter(Boolean).join(", ");
  const baseUrl = await getBaseUrl();
  // Datos estructurados solo de anuncios públicos y activos; nunca la dirección exacta.
  const jsonLd =
    l.status === "active"
      ? listingJsonLd(
          baseUrl,
          l,
          l.photos.map((p) => publicStorageUrl("listing-photos", p)),
          stats ? { count: Number(stats.review_count), average: Number(stats.avg_rating) } : null,
        )
      : null;

  const facts: Array<[string, string]> = [];
  const period =
    l.rental_term === "indefinite"
      ? "Sin fecha de fin"
      : `${RENTAL_TERM_LABELS[l.rental_term]}${l.available_until ? `, hasta el ${formatShortDate(l.available_until)}` : ""}`;
  if (l.kind === "seeking") {
    if (l.max_budget) facts.push(["Presupuesto", `Hasta ${formatEuros(l.max_budget)}/mes`]);
    if (l.move_in_date) facts.push(["Fecha de entrada", formatShortDate(l.move_in_date)]);
    facts.push(["Para cuánto tiempo", period]);
    if (l.cohabitation !== "any") facts.push(["Convivencia", COHABITATION_LABELS[l.cohabitation]]);
    if (l.zones.length) facts.push(["Zonas", l.zones.join(", ")]);
  } else {
    if (l.monthly_rent) facts.push(["Precio", `${formatEuros(l.monthly_rent)}/mes`]);
    if (l.deposit !== null) facts.push(["Fianza", formatEuros(l.deposit)]);
    if (l.available_from) facts.push(["Disponible desde", formatShortDate(l.available_from)]);
    facts.push(["Periodo de alquiler", period]);
    if (l.cohabitation !== "any") facts.push(["Convivencia", COHABITATION_LABELS[l.cohabitation]]);
    if (l.min_stay_months) facts.push(["Estancia mínima", `${l.min_stay_months} meses`]);
    if (l.bills_included !== null) facts.push(["Gastos", l.bills_included ? "Incluidos" : "No incluidos"]);
    if (l.furnished !== null) facts.push(["Amueblado", l.furnished ? "Sí" : "No"]);
    if (l.size_m2) facts.push(["Superficie", `${l.size_m2} m²`]);
    if (l.bedrooms !== null) facts.push(["Habitaciones", String(l.bedrooms)]);
    if (l.bathrooms !== null) facts.push(["Baños", String(l.bathrooms)]);
    if (l.current_flatmates !== null) facts.push(["Compañeros actuales", String(l.current_flatmates)]);
  }
  const rules = RULE_KEYS.filter((k) => l.rules[k] !== undefined).map((k) =>
    l.rules[k] ? RULE_LABELS[k].yes : RULE_LABELS[k].no,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {jsonLd ? (
        <JsonLdScript
          data={[
            jsonLd,
            breadcrumbJsonLd(baseUrl, [
              { name: "Inicio", path: "/" },
              { name: l.kind === "room" ? "Habitaciones" : "Pisos", path: l.kind === "room" ? "/anuncios?tipo=room" : "/anuncios?tipo=flat" },
              { name: l.title, path: `/anuncios/${l.id}` },
            ]),
          ]}
        />
      ) : null}
      {sp.publicado === "1" ? (
        <p role="status" className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          ¡Anuncio publicado! Ya aparece en los resultados de búsqueda.
        </p>
      ) : null}
      {l.status !== "active" ? (
        <p className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Este anuncio está en estado «{STATUS_LABELS[l.status]}» y no aparece en las búsquedas.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">{KIND_LABELS[l.kind]}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{l.title}</h1>
            <p className="text-muted">{place}</p>
            <p className="text-xl font-semibold">{priceText(l)}</p>
          </header>

          {l.kind !== "seeking" ? <Gallery photos={l.photos} title={l.title} /> : null}

          <section aria-labelledby="datos" className="space-y-3">
            <h2 id="datos" className="text-lg font-semibold">
              Datos clave
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="descripcion">
            <h2 id="descripcion" className="text-lg font-semibold">
              Descripción
            </h2>
            <p className="mt-2 whitespace-pre-line">{l.description}</p>
          </section>

          {rules.length ? (
            <section aria-labelledby="normas" className="space-y-3">
              <h2 id="normas" className="text-lg font-semibold">
                Normas de la casa
              </h2>
              <ul className="flex flex-wrap gap-2">
                {rules.map((r) => (
                  <li key={r}>
                    <Chip>{r}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {l.kind !== "seeking" ? (
            <section aria-labelledby="ubicacion" className="space-y-2">
              <h2 id="ubicacion" className="text-lg font-semibold">
                Ubicación
              </h2>
              {address ? (
                <p>
                  {address.address_line}
                  {address.floor_door ? `, ${address.floor_door}` : ""}
                  {address.postal_code ? ` · ${address.postal_code}` : ""}
                  {isOwner ? <span className="ml-2 text-sm text-muted">(solo la ves tú y los interesados aceptados)</span> : null}
                </p>
              ) : (
                <p className="text-muted">
                  Zona aproximada: <strong className="text-foreground">{place}</strong>. La dirección exacta se comparte cuando
                  el anunciante acepta tu interés.
                </p>
              )}
            </section>
          ) : null}

          {l.kind !== "seeking" ? (
            <section aria-labelledby="resenas-inmueble" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="resenas-inmueble" className="text-lg font-semibold">
                  Reseñas del inmueble
                </h2>
                {stats ? <Rating value={Number(stats.avg_rating)} count={Number(stats.review_count)} size="sm" /> : null}
              </div>
              {stats && stats.criteria_avg && Object.keys(stats.criteria_avg).length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-brand-soft p-3 text-sm sm:grid-cols-5">
                  {Object.entries(stats.criteria_avg as Record<string, number>).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted">{CRITERIA_LABELS[k] ?? k}</dt>
                      <dd className="font-medium">{formatRating(Number(v))}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {reviews.length ? (
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} viewer={{ viewerId: viewer?.id ?? null, respondentId: l.owner_id, path: `/anuncios/${l.id}` }} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  Todavía no hay reseñas de este inmueble. Solo pueden opinar quienes han vivido aquí.
                </p>
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {owner ? (
            <section aria-labelledby="anunciante" className="space-y-3 rounded-2xl border border-border bg-background p-4">
              <h2 id="anunciante" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Anunciante
              </h2>
              <div className="flex items-center gap-3">
                <Avatar name={owner.display_name} path={owner.avatar_path} size="md" />
                <div className="min-w-0">
                  <Link href={`/perfil/${owner.id}`} className="font-semibold hover:text-brand">
                    {owner.display_name}
                  </Link>
                  <p className="text-sm text-muted">En Convivo desde {formatMonth(owner.created_at)}</p>
                </div>
              </div>
              {ownerRating ? (
                <Rating value={ownerRating.avg} count={ownerRating.count} size="sm" />
              ) : (
                <p className="text-sm text-muted">Aún sin reseñas.</p>
              )}
              {owner.email_verified ? (
                <Chip tone="success">
                  <span aria-hidden="true">✓</span> Email verificado
                </Chip>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Contactar" className="space-y-3 rounded-2xl border border-border bg-background p-4">
            {isOwner ? (
              <>
                <p className="text-sm text-muted">Es tu anuncio.</p>
                <Link href={`/publicar/${l.id}?paso=datos`} className="block rounded-full border border-border px-4 py-2.5 text-center font-medium hover:border-brand">
                  Editar anuncio
                </Link>
                <Link href="/mis-anuncios" className="block text-center text-sm font-medium text-brand underline">
                  Ir a mis anuncios
                </Link>
              </>
            ) : viewer && myInterest ? (
              <>
                <p className="text-sm">
                  Ya mostraste interés (<strong>{INTEREST_STATUS_LABELS[myInterest.status].toLowerCase()}</strong>).
                </p>
                <Link
                  href={`/mensajes/${myInterest.id}`}
                  className="block rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground hover:bg-brand-strong"
                >
                  Ir a la conversación
                </Link>
              </>
            ) : viewer && l.status === "active" ? (
              <InterestForm listingId={l.id} ownerName={owner?.display_name.split(" ")[0] ?? "el anunciante"} />
            ) : viewer ? (
              <p className="text-sm text-muted">Este anuncio no admite contactos ahora mismo.</p>
            ) : (
              <Link
                href={`/entrar?next=/anuncios/${l.id}`}
                className="block rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground hover:bg-brand-strong"
              >
                Entra para contactar
              </Link>
            )}
            <p className="text-xs text-muted">Nunca pagues ni envíes dinero antes de ver la vivienda y firmar un contrato.</p>
            {!isOwner ? (
              <Link href={`/denunciar?url=/anuncios/${l.id}`} className="block text-center text-xs text-muted underline">
                Notificar este anuncio como ilegal o fraudulento
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
