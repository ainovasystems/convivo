import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/profile/avatar";
import { ReviewCard } from "@/components/profile/review-card";
import { Chip } from "@/components/ui/chip";
import { Rating } from "@/components/ui/rating";
import { getCurrentUser } from "@/lib/auth";
import { ageFromBirthYear, habitChips, LANGUAGES, ROLE_LABELS, type LanguageCode } from "@/lib/profile/options";
import {
  getActiveListingsByOwner,
  getProfile,
  getProfileStats,
  getReceivedReviews,
  profileIdSchema,
} from "@/lib/profile/queries";
import { CRITERIA_LABELS, formatMonth, formatRating, overallRating, PROFILE_REVIEW_GROUPS } from "@/lib/reviews/labels";

type Props = { params: Promise<{ id: string }> };

const KIND_LABELS = { room: "Habitación", flat: "Piso entero", seeking: "Busca piso" } as const;
const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!profileIdSchema.safeParse(id).success) return {};
  const profile = await getProfile(id);
  if (!profile) return {};
  return {
    title: profile.display_name,
    description: profile.bio?.slice(0, 155) ?? `Perfil de ${profile.display_name} en Convivo.`,
    // Los perfiles de personas no se indexan nunca, aunque se encienda la indexación.
    robots: { index: false, follow: false },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { id } = await params;
  if (!profileIdSchema.safeParse(id).success) notFound();

  const profile = await getProfile(id);
  if (!profile) notFound();

  const [stats, reviews, listings, viewer] = await Promise.all([
    getProfileStats(id),
    getReceivedReviews(id),
    getActiveListingsByOwner(id),
    getCurrentUser(),
  ]);

  const overall = overallRating(stats);
  const chips = habitChips(profile.habits);
  const isOwn = viewer?.id === profile.id;
  const age = ageFromBirthYear(profile.birth_year);
  // Menos de 90 días: quien la vea sabe que el perfil aún no tiene historial propio.
  const isNewAccount = Date.now() - new Date(profile.created_at).getTime() < 90 * 24 * 3600 * 1000;
  const facts = [profile.city, profile.occupation, age ? `${age} años` : null].filter(
    Boolean,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:py-12">
      <section aria-labelledby="perfil-nombre" className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={profile.display_name} path={profile.avatar_path} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="perfil-nombre" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {profile.display_name}
            </h1>
            {isOwn ? (
              <Link
                href="/mis-resenas"
                className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-brand focus-visible:outline-2"
              >
                Mis reseñas
              </Link>
            ) : null}
            {isOwn ? (
              <Link
                href="/perfil/editar"
                className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-brand focus-visible:outline-2"
              >
                Editar perfil
              </Link>
            ) : null}
          </div>
          {facts.length ? <p className="text-muted">{facts.join(" · ")}</p> : null}
          <p className="text-sm text-muted">
            En Convivo desde {formatMonth(profile.created_at)}
            {isNewAccount && !profile.deleted_at ? (
              <span className="ml-2 rounded-full bg-accent/30 px-2 py-0.5 text-xs font-bold text-foreground">Cuenta nueva</span>
            ) : null}
          </p>
          {profile.restored_from ? (
            <p className="text-sm text-muted">
              Volvió a Convivo con el mismo email: sus reseñas incluyen las de su cuenta anterior.
            </p>
          ) : null}
          <ul aria-label="Verificaciones" className="flex flex-wrap gap-2 pt-1">
            {profile.email_verified ? (
              <li>
                <Chip tone="success">
                  <span aria-hidden="true">✓</span> Email verificado
                </Chip>
              </li>
            ) : null}
            {profile.phone_verified ? (
              <li>
                <Chip tone="success">
                  <span aria-hidden="true">✓</span> Teléfono verificado
                </Chip>
              </li>
            ) : null}
            {profile.roles.map((role) => (
              <li key={role}>
                <Chip>{ROLE_LABELS[role]}</Chip>
              </li>
            ))}
          </ul>
          <div className="pt-1">
            {overall ? (
              <Rating value={overall.avg} count={overall.count} />
            ) : (
              <p className="text-sm text-muted">Todavía sin reseñas.</p>
            )}
          </div>
        </div>
      </section>

      {profile.bio ? (
        <section aria-labelledby="sobre">
          <h2 id="sobre" className="text-lg font-semibold">
            Sobre {isOwn ? "mí" : profile.display_name.split(" ")[0]}
          </h2>
          <p className="mt-2 whitespace-pre-line">{profile.bio}</p>
        </section>
      ) : isOwn ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
          Aún no has escrito una presentación.{" "}
          <Link href="/perfil/editar" className="font-medium text-brand underline">
            Añádela
          </Link>{" "}
          para que los demás sepan con quién van a convivir.
        </p>
      ) : null}

      {chips.length || profile.languages.length ? (
        <section aria-labelledby="convivencia" className="space-y-4">
          <h2 id="convivencia" className="text-lg font-semibold">
            Convivencia
          </h2>
          {chips.length ? (
            <ul aria-label="Hábitos" className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c}>
                  <Chip>{c}</Chip>
                </li>
              ))}
            </ul>
          ) : null}
          {profile.languages.length ? (
            <p className="text-sm">
              <span className="text-muted">Idiomas: </span>
              {profile.languages.map((l) => LANGUAGES[l as LanguageCode] ?? l).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="resenas" className="space-y-6">
        <h2 id="resenas" className="text-lg font-semibold">
          Reseñas recibidas
        </h2>
        <p className="text-sm text-muted">
          Solo pueden opinar personas que han convivido de verdad, tras una estancia confirmada por ambas partes.
        </p>
        {PROFILE_REVIEW_GROUPS.map((group) => {
          const groupStats = stats.find((s) => s.relationship === group.relationship);
          const groupReviews = reviews.filter((r) => r.relationship === group.relationship);
          const headingId = `resenas-${group.relationship}`;
          return (
            <section key={group.relationship} aria-labelledby={headingId} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={headingId} className="font-semibold">
                  {group.title}
                </h3>
                {groupStats ? <Rating value={groupStats.avg_rating} count={groupStats.review_count} size="sm" /> : null}
              </div>
              {groupStats && Object.keys(groupStats.criteria_avg).length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-brand-soft p-3 text-sm sm:grid-cols-4">
                  {Object.entries(groupStats.criteria_avg).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted">{CRITERIA_LABELS[key] ?? key}</dt>
                      <dd className="font-medium">{formatRating(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {groupReviews.length ? (
                <ul className="space-y-3">
                  {groupReviews.map((r) => (
                    <ReviewCard key={r.id} review={r} viewer={{ viewerId: viewer?.id ?? null, respondentId: profile.id, path: `/perfil/${profile.id}` }} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{group.empty}</p>
              )}
            </section>
          );
        })}
      </section>

      <section aria-labelledby="anuncios" className="space-y-3">
        <h2 id="anuncios" className="text-lg font-semibold">
          Anuncios activos
        </h2>
        {listings.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {listings.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/anuncios/${l.id}`}
                  className="block h-full rounded-2xl border border-border bg-background p-4 hover:border-brand focus-visible:outline-2"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand">{KIND_LABELS[l.kind]}</span>
                  <span className="mt-1 block font-medium">{l.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {[l.neighborhood, l.city].filter(Boolean).join(", ")}
                    {l.monthly_rent ? ` · ${euro.format(l.monthly_rent)}/mes` : null}
                    {l.max_budget ? ` · hasta ${euro.format(l.max_budget)}/mes` : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No tiene anuncios activos ahora mismo.</p>
        )}
      </section>
      <p className="text-center text-xs text-muted">
        <Link href={`/denunciar?url=/perfil/${profile.id}`} className="underline">
          Notificar este perfil como ilegal
        </Link>
      </p>
    </div>
  );
}
