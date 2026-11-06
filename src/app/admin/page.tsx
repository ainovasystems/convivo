import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingFlagForm } from "@/components/admin/listing-flag-form";
import { ModerationForms } from "@/components/reviews/moderation-forms";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/reviews/labels";
import { REPORT_REASONS } from "@/lib/reviews/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderación", robots: { index: false } };

const FLAG_REASONS: Record<string, string> = {
  payment_scam: "Texto típico de estafa",
  low_price: "Precio sospechosamente bajo",
};

const LOG_ACTIONS: Record<string, string> = {
  report_dismissed: "Denuncia descartada",
  report_resolved: "Denuncia resuelta",
  review_deleted: "Reseña eliminada",
  listing_flag_dismissed: "Marca de fraude descartada",
  listing_flag_actioned: "Anuncio cerrado por fraude",
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  // A quien no es admin le respondemos 404: ni siquiera confirmamos que exista.
  if (!isAdmin) notFound();

  const [{ data: reports }, { data: flags }, { data: listingFlags }, { data: log }] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "id, reason, details, created_at, target_listing_id, target_user_id, target_message_id, reporter:profiles!reports_reporter_id_fkey(id, display_name), review:reviews!reports_target_review_id_fkey(id, body, rating, deleted_at, author:profiles!reviews_author_id_fkey(id, display_name), subject_user:profiles!reviews_subject_user_id_fkey(id, display_name), subject_listing:listings!reviews_subject_listing_id_fkey(id, title))",
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase.rpc("admin_review_flags"),
    supabase
      .from("listing_flags")
      .select("id, reason, details, created_at, listing:listings!listing_flags_listing_id_fkey(id, title, city, status, owner_id)")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("moderation_log")
      .select("id, action, target_type, target_id, note, created_at, actor:profiles!moderation_log_actor_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(50),
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
              <li key={r.id} className="space-y-3 rounded-2xl border border-border bg-background p-4">
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
                  <blockquote className="rounded-xl bg-brand-soft p-3 text-sm">
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

      <section aria-labelledby="fraude" className="space-y-4">
        <h2 id="fraude" className="text-lg font-semibold">
          Anuncios marcados por posible fraude ({listingFlags?.length ?? 0})
        </h2>
        <p className="text-sm text-muted">
          Marcas automáticas: siguen publicados y el anunciante no lo sabe. Revísalos y decide.
        </p>
        {listingFlags?.length ? (
          <ul className="space-y-4">
            {listingFlags.map((f) => (
              <li key={f.id} className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p>
                    <strong>{FLAG_REASONS[f.reason] ?? f.reason}</strong> · {f.details}
                  </p>
                  <p className="text-muted">{formatDate(f.created_at)}</p>
                </div>
                {f.listing ? (
                  <p className="text-sm">
                    <Link className="font-medium underline" href={`/anuncios/${f.listing.id}`}>
                      {f.listing.title}
                    </Link>{" "}
                    · {f.listing.city} ·{" "}
                    <Link className="underline" href={`/perfil/${f.listing.owner_id}`}>
                      anunciante
                    </Link>
                  </p>
                ) : null}
                <ListingFlagForm flagId={f.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No hay anuncios marcados.</p>
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

      <section aria-labelledby="registro" className="space-y-3">
        <h2 id="registro" className="text-lg font-semibold">
          Registro de moderación
        </h2>
        <p className="text-sm text-muted">Últimas 50 acciones. Nadie puede modificar ni borrar este registro.</p>
        {log?.length ? (
          <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
            {log.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  <strong>{LOG_ACTIONS[e.action] ?? e.action}</strong>
                  {e.note ? <span className="text-muted"> · «{e.note}»</span> : null}
                </span>
                <span className="text-muted">
                  {e.actor?.display_name ?? "Sistema"} · {formatDate(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Todavía no hay acciones registradas.</p>
        )}
      </section>
    </div>
  );
}
