import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ParticipationActions } from "@/components/conversations/participation-actions";
import { getCurrentUser } from "@/lib/auth";
import { getMyStays } from "@/lib/conversations/queries";
import { STAY_STATUS_LABELS } from "@/lib/conversations/state";
import { formatShortDate } from "@/lib/listings/options";

export const metadata: Metadata = { title: "Mis estancias", robots: { index: false } };

export default async function MyStaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/mis-estancias");
  const stays = await getMyStays();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Mis estancias</h1>
      <p className="text-muted">
        Las estancias confirmadas por todas las partes son las que permiten dejar y recibir reseñas. Al firmar un contrato
        en Convivo, la estancia se confirma sola.{" "}
        <Link href="/contratos" className="font-semibold text-brand underline">
          Ver mis contratos
        </Link>
      </p>
      {stays.length ? (
        <ul className="space-y-3">
          {stays.map((s) => {
            const myRole = s.host_id === user.id ? "Anfitrión/a" : s.guest_id === user.id ? "Inquilino/a" : "Compañero/a";
            const me = s.stay_participants.find((p) => p.user_id === user.id);
            return (
              <li key={s.id} className="space-y-2 rounded-2xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/anuncios/${s.listing?.id}`} className="font-semibold hover:text-brand">
                    {s.listing?.title}
                  </Link>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">{STAY_STATUS_LABELS[s.status]}</span>
                </div>
                <p className="text-sm text-muted">
                  {myRole} · {s.host?.display_name} y {s.guest?.display_name} ·{" "}
                  {s.end_date ? `del ${formatShortDate(s.start_date)} al ${formatShortDate(s.end_date)}` : `desde el ${formatShortDate(s.start_date)}`}
                  {s.is_retroactive ? " · estancia anterior a Convivo" : ""}
                </p>
                {me && !me.confirmed_at ? (
                  <div className="space-y-2 rounded-xl bg-brand-soft p-3">
                    <p className="text-sm">Te han añadido como compañero/a de piso en esta estancia. ¿Es correcto?</p>
                    <ParticipationActions stayId={s.id} />
                  </div>
                ) : null}
                {s.interest_id && (s.host_id === user.id || s.guest_id === user.id) ? (
                  <Link href={`/mensajes/${s.interest_id}`} className="text-sm font-medium text-brand underline">
                    Ir a la conversación
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Aún no tienes estancias.</p>
          <p className="mt-1 text-sm text-muted">Se proponen desde una conversación con un interés aceptado.</p>
        </div>
      )}
    </div>
  );
}
