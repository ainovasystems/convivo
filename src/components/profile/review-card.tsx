import Link from "next/link";

import { Avatar } from "@/components/profile/avatar";
import { ReportForm, RespondForm } from "@/components/reviews/review-interactions";
import { Rating } from "@/components/ui/rating";
import type { ReceivedReview } from "@/lib/profile/queries";
import { CRITERIA_LABELS, formatDate } from "@/lib/reviews/labels";

type Viewer = { viewerId: string | null; respondentId: string; path: string };

export function ReviewCard({ review, viewer }: { review: ReceivedReview; viewer?: Viewer }) {
  if (review.deleted_at) {
    return (
      <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
        Reseña eliminada el {formatDate(review.deleted_at)}
        {review.deletion_reason ? <>. Motivo: «{review.deletion_reason}»</> : null}
      </li>
    );
  }

  const author = review.author;
  return (
    <li className="rounded-2xl border border-border bg-background p-4">
      <article className="space-y-3">
        <header className="flex items-center gap-3">
          {author ? <Avatar name={author.display_name} path={author.avatar_path} size="sm" /> : null}
          <div className="min-w-0">
            {author ? (
              <Link href={`/perfil/${author.id}`} className="font-medium hover:text-brand">
                {author.display_name}
              </Link>
            ) : (
              <span className="font-medium">Usuario eliminado</span>
            )}
            <p className="text-sm text-muted">
              <time dateTime={review.published_at}>{formatDate(review.published_at)}</time>
            </p>
          </div>
          {review.rating ? (
            <div className="ml-auto">
              <Rating value={review.rating} size="sm" />
            </div>
          ) : null}
        </header>
        {review.body ? <p className="whitespace-pre-line">{review.body}</p> : null}
        {review.criteria ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {Object.entries(review.criteria).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2 sm:block">
                <dt className="text-muted">{CRITERIA_LABELS[key] ?? key}</dt>
                <dd className="font-medium">{value}/5</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {review.response ? (
          <div className="ml-4 border-l-2 border-brand/40 pl-3 text-sm">
            <p className="font-medium">Respuesta de la persona reseñada</p>
            <p className="whitespace-pre-line text-muted">{review.response.body}</p>
          </div>
        ) : null}
        {viewer?.viewerId ? (
          <div className="flex flex-col gap-2">
            {viewer.viewerId === viewer.respondentId && !review.response ? (
              <RespondForm reviewId={review.id} path={viewer.path} />
            ) : null}
            {viewer.viewerId !== review.author?.id ? <ReportForm reviewId={review.id} path={viewer.path} /> : null}
          </div>
        ) : (
          // Sin cuenta también se puede notificar una reseña ilegal (DSA art. 16).
          <Link
            href={`/denunciar?url=${encodeURIComponent(viewer?.path ?? "/")}&resena=${review.id}`}
            className="self-start text-xs text-muted underline"
          >
            Notificar contenido ilegal
          </Link>
        )}
      </article>
    </li>
  );
}
