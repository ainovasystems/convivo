"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { markRead, sendMessage, type SentMessage } from "@/app/mensajes/actions";
import { buttonClass } from "@/components/ui/submit-button";
import { inputClass } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

const timeFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ChatThread({
  interestId,
  currentUserId,
  names,
  initialMessages,
  canWrite,
  isGuest,
  listingId,
  serverStatus,
}: {
  interestId: string;
  currentUserId: string;
  names: Record<string, string>;
  initialMessages: SentMessage[];
  canWrite: boolean;
  isGuest: boolean;
  listingId: string;
  serverStatus: string;
}) {
  // Estado del interés recibido por Realtime: se muestra al momento, sin
  // depender de que llegue el refresco completo de la página.
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Realtime: mensajes nuevos y cambios de estado del interés. RLS decide
  // qué eventos recibe cada suscriptor (solo las dos partes).
  useEffect(() => {
    const supabase = createClient();
    void markRead(interestId);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const subscribe = () =>
      supabase
      .channel(`conversacion:${interestId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `interest_id=eq.${interestId}` },
        (payload) => {
          const m = payload.new as SentMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== currentUserId) void markRead(interestId);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "interests", filter: `id=eq.${interestId}` },
        (payload) => {
          setLiveStatus((payload.new as { status?: string }).status ?? null);
          router.refresh();
        },
      )
      .subscribe();

    // Importante: fijar el token de la sesión ANTES de suscribirse. Si no, el
    // canal se une como anónimo y RLS filtra todos los mensajes.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!cancelled) channel = subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [interestId, currentUserId, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await sendMessage(interestId, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft("");
      setMessages((prev) => (prev.some((x) => x.id === r.message.id) ? prev : [...prev, r.message]));
    });
  }

  return (
    <section aria-label="Mensajes" className="space-y-4">
      {liveStatus === "accepted" && serverStatus !== "accepted" && isGuest ? (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          ¡El anunciante ha aceptado tu interés! Ya puedes ver la{" "}
          <a href={`/anuncios/${listingId}`} className="font-medium underline">
            dirección exacta en el anuncio
          </a>
          .
        </p>
      ) : null}
      {liveStatus === "declined" && serverStatus !== "declined" && isGuest ? (
        <p role="status" className="rounded-full border border-border px-3 py-2 text-sm text-muted">
          El anunciante ha rechazado tu interés.
        </p>
      ) : null}
      <ol className="max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-background p-3" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <li key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-2 " +
                  (mine ? "rounded-br-sm bg-brand text-brand-foreground" : "rounded-bl-sm bg-brand/10")
                }
              >
                <p className="sr-only">{mine ? "Tú" : names[m.sender_id] ?? "Otra persona"}:</p>
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p className={"mt-1 text-xs " + (mine ? "opacity-80" : "text-muted")}>
                  <time dateTime={m.created_at}>{timeFmt.format(new Date(m.created_at))}</time>
                </p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <strong>Nunca pagues antes de ver el piso.</strong> Desconfía de quien pida señales, transferencias o envíos de dinero por adelantado.
      </p>

      {canWrite ? (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="chat-body" className="sr-only">
            Escribe un mensaje
          </label>
          <textarea
            id="chat-body"
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
            className={inputClass}
            placeholder="Escribe un mensaje…"
          />
          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <button type="submit" className={buttonClass} disabled={pending || !draft.trim()}>
            {pending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">Esta conversación está cerrada.</p>
      )}
    </section>
  );
}
