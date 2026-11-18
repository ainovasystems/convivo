import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { markNotificationsRead } from "@/app/avisos/actions";
import { getCurrentUser } from "@/lib/auth";
import { groupNotifications } from "@/lib/notifications/group";
import { getMyNotifications, type NotificationView } from "@/lib/notifications/queries";

export const metadata: Metadata = { title: "Avisos", robots: { index: false } };

const when = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

const SHORTCUTS = [
  { href: "/contratos", label: "Contratos", hint: "Firmar, inventario y fianza" },
  { href: "/mis-resenas", label: "Reseñas", hint: "Pendientes y escritas" },
  { href: "/mis-estancias", label: "Estancias", hint: "Confirmadas y propuestas" },
  { href: "/mis-anuncios", label: "Mis anuncios", hint: "Editar, pausar o cerrar" },
];

function Notice({ n, tone }: { n: NotificationView; tone: "todo" | "news" | "past" }) {
  const body = (
    <>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className={tone === "past" ? "font-medium" : "font-bold"}>{n.title}</span>
        <time dateTime={n.created_at} className="text-xs text-muted">
          {when.format(new Date(n.created_at))}
        </time>
      </span>
      {n.body ? <span className="mt-1 block text-sm text-muted">{n.body}</span> : null}
      {n.url ? (
        <span className="mt-2 block text-sm font-semibold text-brand underline">{tone === "todo" ? "Ir a hacerlo" : "Abrir"}</span>
      ) : null}
    </>
  );
  const box =
    "block rounded-2xl border p-4 " +
    (tone === "todo" ? "border-2 border-brand/40 bg-brand-soft/40" : tone === "news" ? "border-border bg-surface" : "border-border text-foreground/80");
  return (
    <li>
      {n.url ? (
        // Enlace normal (sin precarga): abrirlo marca el aviso como leído y lleva a su pantalla.
        <a href={`/avisos/${n.id}`} className={box + " hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"}>
          {body}
        </a>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/avisos");
  const { todo, news, past } = groupNotifications(await getMyNotifications());

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
        <p className="mt-2 text-muted">Lo que te toca hacer y lo que ha pasado en tus contratos, fianzas y reseñas.</p>
      </div>

      <nav aria-label="Accesos directos">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="block h-full rounded-2xl border border-border p-3 hover:border-brand">
                <span className="block font-bold">{s.label}</span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="te-toca" className="space-y-3">
        <h2 id="te-toca" className="text-lg font-semibold">
          Te toca {todo.length ? <span className="text-muted">({todo.length})</span> : null}
        </h2>
        {todo.length ? (
          <ul className="space-y-2" data-testid="avisos-pendientes">
            {todo.map((n) => (
              <Notice key={n.id} n={n} tone="todo" />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-muted">No tienes nada pendiente. Cuando te toque firmar, confirmar o responder algo, lo verás aquí.</p>
        )}
      </section>

      {news.length ? (
        <section aria-labelledby="novedades" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="novedades" className="text-lg font-semibold">
              Novedades <span className="text-muted">({news.length})</span>
            </h2>
            <form action={markNotificationsRead}>
              <button type="submit" className="text-sm font-medium text-brand underline">
                Marcar como leídas
              </button>
            </form>
          </div>
          <ul className="space-y-2">
            {news.map((n) => (
              <Notice key={n.id} n={n} tone="news" />
            ))}
          </ul>
        </section>
      ) : null}

      {past.length ? (
        <section aria-labelledby="anteriores" className="space-y-3">
          <h2 id="anteriores" className="text-lg font-semibold">
            Anteriores
          </h2>
          <p className="text-sm text-muted">Ya atendidos o leídos. No hace falta que hagas nada con ellos.</p>
          <ul className="space-y-2">
            {past.map((n) => (
              <Notice key={n.id} n={n} tone="past" />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
