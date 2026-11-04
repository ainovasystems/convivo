import Link from "next/link";

const NAV_LINKS = [
  { href: "/anuncios", label: "Anuncios" },
  { href: "/publicar", label: "Publicar" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-brand focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Convivo
        </Link>
        <nav aria-label="Principal">
          <ul className="flex items-center gap-1 text-sm font-medium sm:gap-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-2 py-2 hover:text-brand focus-visible:outline-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/entrar"
                className="rounded-md bg-brand px-3 py-2 text-brand-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Entrar
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
