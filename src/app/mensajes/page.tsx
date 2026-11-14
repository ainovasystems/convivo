import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/profile/avatar";
import { getCurrentUser } from "@/lib/auth";
import { listConversations } from "@/lib/conversations/queries";
import { INTEREST_STATUS_LABELS } from "@/lib/conversations/state";

export const metadata: Metadata = { title: "Mensajes", robots: { index: false } };

const relTime = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
function ago(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return relTime.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return relTime.format(hours, "hour");
  return relTime.format(Math.round(hours / 24), "day");
}

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/mensajes");
  const conversations = await listConversations();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Mensajes</h1>
        <Link href="/mis-estancias" className="text-sm font-medium text-brand underline">
          Mis estancias
        </Link>
      </div>
      {conversations.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-background">
          {conversations.map((c) => {
            const iAmOwner = c.listing?.owner_id === user.id;
            const other = iAmOwner ? c.guest : c.listing?.owner;
            return (
              <li key={c.id}>
                <Link
                  href={`/mensajes/${c.id}`}
                  className="flex items-start gap-3 p-4 hover:bg-brand/5 focus-visible:outline-2"
                >
                  <Avatar name={other?.display_name ?? "?"} path={other?.avatar_path ?? null} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={"truncate " + (c.unread ? "font-bold" : "font-medium")}>{other?.display_name}</p>
                      <span className="shrink-0 text-xs text-muted">{ago(c.sortKey)}</span>
                    </div>
                    <p className="truncate text-sm text-muted">
                      {iAmOwner ? "Interesado/a en" : "Tu interés en"} «{c.listing?.title}» · {INTEREST_STATUS_LABELS[c.status]}
                    </p>
                    {c.lastMessage ? <p className="mt-1 truncate text-sm">{c.lastMessage.body}</p> : null}
                  </div>
                  {c.unread ? <span className="sr-only">{c.unread} sin leer</span> : null}
                  {c.unread ? (
                    <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground" aria-hidden="true">
                      {c.unread}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Aún no tienes conversaciones.</p>
          <p className="mt-1 text-sm text-muted">Cuando muestres interés en un anuncio, o alguien en los tuyos, aparecerá aquí.</p>
          <Link href="/anuncios" className="mt-4 inline-block font-medium text-brand underline">
            Buscar anuncios
          </Link>
        </div>
      )}
    </div>
  );
}
