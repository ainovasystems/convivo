"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatIcon, PlusIcon, SearchIcon, StarIcon, UserIcon } from "@/components/brand/icons";

/** Barra de pestañas inferior (solo móvil), como en las apps nativas. */
export function BottomNav({ loggedIn, unread, profileHref }: { loggedIn: boolean; unread: number; profileHref: string }) {
  const pathname = usePathname();
  const items = [
    { href: "/anuncios", label: "Buscar", Icon: SearchIcon, match: ["/anuncios", "/"] },
    { href: loggedIn ? "/mensajes" : "/entrar?next=/mensajes", label: "Mensajes", Icon: ChatIcon, match: ["/mensajes"], badge: unread },
    { href: "/publicar", label: "Publicar", Icon: PlusIcon, match: ["/publicar"], primary: true },
    { href: loggedIn ? "/mis-resenas" : "/entrar?next=/mis-resenas", label: "Reseñas", Icon: StarIcon, match: ["/mis-resenas", "/resenas"] },
    { href: profileHref, label: "Perfil", Icon: UserIcon, match: ["/perfil", "/entrar", "/registro", "/mis-anuncios", "/mis-estancias", "/cuenta", "/contratos"] },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon, match, badge, primary }) => {
          const active = match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m)));
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={"flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold " + (active ? "text-brand" : "text-muted")}
              >
                {primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[var(--shadow-lift)] ring-4 ring-background">
                    <Icon className="size-6" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="size-6" />
                    {badge ? (
                      <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-accent-foreground">
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only"> sin leer</span>
                      </span>
                    ) : null}
                  </span>
                )}
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
