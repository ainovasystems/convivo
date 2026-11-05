import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ChatThread } from "@/components/conversations/chat-thread";
import { InterestActions } from "@/components/conversations/interest-actions";
import { StaysPanel } from "@/components/conversations/stays-panel";
import { Avatar } from "@/components/profile/avatar";
import { getCurrentUser } from "@/lib/auth";
import { getConversation } from "@/lib/conversations/queries";
import { INTEREST_STATUS_LABELS, interestActions } from "@/lib/conversations/state";

export const metadata: Metadata = { title: "Conversación", robots: { index: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=/mensajes/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const conversation = await getConversation(id);
  if (!conversation?.interest.listing) notFound();
  const { interest, messages, stays } = conversation;
  const listing = interest.listing!;
  const role = listing.owner_id === user.id ? "owner" : "guest";
  const other = role === "owner" ? interest.guest : listing.owner;
  const actions = interestActions(interest.status, role);

  const names: Record<string, string> = {};
  if (interest.guest) names[interest.guest.id] = interest.guest.display_name;
  if (listing.owner) names[listing.owner.id] = listing.owner.display_name;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:py-10">
      <Link href="/mensajes" className="text-sm font-medium text-brand underline">
        ← Todas las conversaciones
      </Link>
      <header className="flex items-start gap-3">
        <Avatar name={other?.display_name ?? "?"} path={other?.avatar_path ?? null} size="md" />
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-bold tracking-tight">
            {other ? (
              <Link href={`/perfil/${other.id}`} className="hover:text-brand">
                {other.display_name}
              </Link>
            ) : (
              "Conversación"
            )}
          </h1>
          <p className="text-sm text-muted">
            Sobre{" "}
            <Link href={`/anuncios/${listing.id}`} className="font-medium text-foreground underline">
              {listing.title}
            </Link>{" "}
            · Interés <strong>{INTEREST_STATUS_LABELS[interest.status].toLowerCase()}</strong>
          </p>
        </div>
      </header>

      <InterestActions interestId={interest.id} actions={actions} />

      {interest.status === "accepted" && role === "guest" ? (
        // Nota: si el cambio llega por Realtime, ChatThread muestra su propio aviso.
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {listing.owner?.display_name} ha aceptado tu interés: ya puedes ver la{" "}
          <Link href={`/anuncios/${listing.id}`} className="font-medium underline">
            dirección exacta en el anuncio
          </Link>
          .
        </p>
      ) : null}

      <ChatThread
        interestId={interest.id}
        currentUserId={user.id}
        names={names}
        initialMessages={messages}
        canWrite={actions.includes("message")}
        isGuest={role === "guest"}
        listingId={listing.id}
        serverStatus={interest.status}
      />

      {listing.kind !== "seeking" && (interest.status === "accepted" || stays.length) ? (
        <StaysPanel
          interestId={interest.id}
          currentUserId={user.id}
          listingKind={listing.kind}
          canPropose={actions.includes("propose_stay")}
          stays={stays}
          names={names}
        />
      ) : null}
    </div>
  );
}
