import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadTotal } from "@/lib/conversations/queries";

const NAV_LINKS = [
  { href: "/anuncios", label: "Anuncios" },
  { href: "/publicar", label: "Publicar" },
] as const;

const linkClass = "rounded-md px-2 py-2 hover:text-brand focus-visible:outline-2";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await getUnreadTotal() : 0;

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-brand focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Convivo
        </Link>
        <nav aria-label="Principal">
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm font-medium sm:gap-x-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
            {user ? (
              <>
                <li>
                  <Link href="/mensajes" className={linkClass + " inline-flex items-center gap-1"}>
                    Mensajes
                    {unread ? (
                      <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-brand-foreground">
                        {unread > 99 ? "99+" : unread}
                        <span className="sr-only"> sin leer</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
                <li>
                  <Link href={`/perfil/${user.id}`} className={linkClass}>
                    Mi perfil
                  </Link>
                </li>
                <li>
                  <form action={signOut}>
                    <button type="submit" className={linkClass}>
                      Salir
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <Link
                  href="/entrar"
                  className="rounded-md bg-brand px-3 py-2 text-brand-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Entrar
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
