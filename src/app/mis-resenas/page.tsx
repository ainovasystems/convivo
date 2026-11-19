import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WithdrawalRequestForm } from "@/components/reviews/review-interactions";
import { Rating } from "@/components/ui/rating";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/reviews/labels";
import { getMyReviewTasks, getMyWithdrawalRequests, getMyWrittenReviews } from "@/lib/reviews/queries";
import { RELATIONSHIP_TITLES } from "@/lib/reviews/targets";

export const metadata: Metadata = { title: "Mis reseñas", robots: { index: false } };

export default async function MyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/mis-resenas");
  const [{ open, upcoming }, written, withdrawals, sp] = await Promise.all([
    getMyReviewTasks(user.id),
    getMyWrittenReviews(user.id),
    getMyWithdrawalRequests(user.id),
    searchParams,
  ]);
  const now = new Date();
  const justSent = typeof sp.enviada === "string" ? written.find((w) => w.id === sp.enviada) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Mis reseñas</h1>
        <Link href={`/perfil/${user.id}`} className="text-sm font-medium text-brand underline">
          Ver las que he recibido
        </Link>
      </div>

      {justSent ? (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {new Date(justSent.published_at) <= now
            ? "Tu reseña está enviada y ya es pública: la otra parte también había opinado."
            : `Tu reseña está enviada. Se publicará cuando la otra parte opine o el ${formatDate(justSent.published_at)}.`}
        </p>
      ) : null}

      <section aria-labelledby="pendientes" className="space-y-3">
        <h2 id="pendientes" className="text-lg font-semibold">
          Pendientes de reseñar
        </h2>
        {open.length ? (
          <ul className="space-y-2">
            {open.map((t) => (
              <li key={`${t.stayId}:${t.subjectId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
                <div>
                  <p className="text-sm text-muted">{t.title}</p>
                  <p className="font-medium">{t.subjectName}</p>
                  <p className="text-sm text-muted">Hasta el {formatDate(t.closesAt)}</p>
                </div>
                <Link
                  href={`/resenas/nueva?estancia=${t.stayId}&sujeto=${t.subjectId}`}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-strong"
                  aria-label={`Escribir ${t.title.toLowerCase()}: ${t.subjectName}`}
                >
                  Escribir reseña
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No tienes reseñas pendientes ahora mismo.</p>
        )}
        {upcoming.length ? (
          <ul className="space-y-1 text-sm text-muted">
            {upcoming.map((u) => (
              <li key={u.stayId}>
                «{u.listingTitle}»: podrás reseñar a partir del {formatDate(u.opensAt)}.
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="enviadas" className="space-y-3">
        <h2 id="enviadas" className="text-lg font-semibold">
          Reseñas que he escrito
        </h2>
        {written.length ? (
          <ul className="space-y-3">
            {written.map((w) => {
              const published = new Date(w.published_at) <= now;
              const subject = w.subject_user?.display_name ?? w.subject_listing?.title ?? "—";
              const withdrawal = withdrawals.get(w.id);
              return (
                <li key={w.id} className="space-y-2 rounded-2xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {RELATIONSHIP_TITLES[w.relationship]}: {subject}
                    </p>
                    <span className="text-xs font-semibold text-muted">
                      {w.deleted_at ? "Eliminada" : published ? "Publicada" : `Se publicará como tarde el ${formatDate(w.published_at)}`}
                    </span>
                  </div>
                  {w.rating ? <Rating value={w.rating} size="sm" /> : null}
                  {w.body ? <p className="whitespace-pre-line text-sm">{w.body}</p> : null}
                  {w.deleted_at ? (
                    <p className="text-sm text-muted">
                      Eliminada el {formatDate(w.deleted_at)}. Motivo: «{w.deletion_reason}»
                    </p>
                  ) : (
                    <>
                      {withdrawal?.status === "dismissed" ? (
                        <p className="text-sm text-muted">
                          Pediste retirarla el {formatDate(withdrawal.created_at)} y no la hemos retirado
                          {withdrawal.resolution_note ? <>. Motivo: «{withdrawal.resolution_note}»</> : "."}
                        </p>
                      ) : null}
                      <WithdrawalRequestForm
                        reviewId={w.id}
                        pendingSince={withdrawal?.status === "open" ? formatDate(withdrawal.created_at) : null}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aún no has escrito ninguna reseña.</p>
        )}
      </section>
    </div>
  );
}
