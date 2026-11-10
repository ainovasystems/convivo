import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { BottomNav } from "@/components/bottom-nav";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadTotal } from "@/lib/conversations/queries";

const linkClass = "rounded-full px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-brand-soft hover:text-brand";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await getUnreadTotal() : 0;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Convivo, inicio" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
            <Logo />
          </Link>

          {/* Escritorio y tablet */}
          <nav aria-label="Principal" className="hidden sm:block">
            <ul className="flex items-center gap-1">
              <li>
                <Link href="/anuncios" className={linkClass}>
                  Buscar
                </Link>
              </li>
              {user ? (
                <>
                  <li>
                    <Link href="/mensajes" className={linkClass + " inline-flex items-center gap-1.5"}>
                      Mensajes
                      {unread ? (
                        <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">
                          {unread > 99 ? "99+" : unread}
                          <span className="sr-only"> sin leer</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                  <li>
                    <Link href="/mis-resenas" className={linkClass}>
                      Reseñas
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
                  <Link href="/entrar" className={linkClass}>
                    Entrar
                  </Link>
                </li>
              )}
              <li className="ml-2">
                <Link
                  href="/publicar"
                  className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground shadow-[var(--shadow-card)] hover:bg-brand-strong"
                >
                  Publicar anuncio
                </Link>
              </li>
            </ul>
          </nav>

          {/* Móvil: lo esencial arriba; el resto, en la barra inferior */}
          <div className="sm:hidden">
            {user ? (
              <form action={signOut}>
                <button type="submit" className="rounded-full px-3 py-2 text-sm font-semibold text-muted">
                  Salir
                </button>
              </form>
            ) : (
              <Link href="/entrar" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-brand-foreground">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>
      <BottomNav loggedIn={Boolean(user)} unread={unread} profileHref={user ? `/perfil/${user.id}` : "/entrar"} />
    </>
  );
}
