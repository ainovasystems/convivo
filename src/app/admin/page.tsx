import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModerationForms } from "@/components/reviews/moderation-forms";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/reviews/labels";
import { REPORT_REASONS } from "@/lib/reviews/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderación", robots: { index: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  // A quien no es admin le respondemos 404: ni siquiera confirmamos que exista.
  if (!isAdmin) notFound();

  const [{ data: reports }, { data: flags }] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "id, reason, details, created_at, target_listing_id, target_user_id, target_message_id, reporter:profiles!reports_reporter_id_fkey(id, display_name), review:reviews!reports_target_review_id_fkey(id, body, rating, deleted_at, author:profiles!reviews_author_id_fkey(id, display_name), subject_user:profiles!reviews_subject_user_id_fkey(id, display_name), subject_listing:listings!reviews_subject_listing_id_fkey(id, title))",
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase.rpc("admin_review_flags"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Moderación</h1>

      <section aria-labelledby="denuncias" className="space-y-4">
        <h2 id="denuncias" className="text-lg font-semibold">
          Denuncias abiertas ({reports?.length ?? 0})
        </h2>
        {reports?.length ? (
          <ul className="space-y-4">
            {reports.map((r) => (
              <li key={r.id} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p>
                    <strong>{REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason}</strong>
                    {r.reason === "personal_data" ? " · reseña oculta cautelarmente" : ""}
                  </p>
                  <p className="text-muted">
                    {r.reporter?.display_name} · {formatDate(r.created_at)}
                  </p>
                </div>
                {r.details ? <p className="text-sm text-muted">«{r.details}»</p> : null}
                {r.review ? (
                  <blockquote className="rounded-md bg-brand/5 p-3 text-sm">
                    <p className="text-muted">
                      De {r.review.author?.display_name} sobre {r.review.subject_user?.display_name ?? r.review.subject_listing?.title}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{r.review.body ?? "(eliminada)"}</p>
                  </blockquote>
                ) : (
                  <p className="text-sm">
                    Objetivo:{" "}
                    {r.target_listing_id ? <Link className="underline" href={`/anuncios/${r.target_listing_id}`}>anuncio</Link> : null}
                    {r.target_user_id ? <Link className="underline" href={`/perfil/${r.target_user_id}`}>perfil</Link> : null}
                    {r.target_message_id ? "mensaje" : null}
                  </p>
                )}
                <ModerationForms reportId={r.id} reviewId={r.review && !r.review.deleted_at ? r.review.id : null} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No hay denuncias abiertas.</p>
        )}
      </section>

      <section aria-labelledby="senales" className="space-y-3">
        <h2 id="senales" className="text-lg font-semibold">
          Señales de posible autorreseña
        </h2>
        <p className="text-sm text-muted">
          Reseñas en las que autor y reseñado se han conectado desde la misma IP (o el mismo navegador). No es una prueba:
          pueden compartir piso o wifi. Úsalo como indicio.
        </p>
        {flags?.length ? (
          <ul className="space-y-1 text-sm">
            {flags.map((f) => (
              <li key={f.review_id}>
                Reseña <code>{f.review_id.slice(0, 8)}</code>: misma IP{f.shared_device ? " y mismo navegador" : ""} ·{" "}
                <Link className="underline" href={`/perfil/${f.subject_user_id}`}>
                  ver perfil reseñado
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin señales.</p>
        )}
      </section>
    </div>
  );
}
