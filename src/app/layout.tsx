import "@fontsource-variable/plus-jakarta-sans";

import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { SiteHeader } from "@/components/site-header";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { SITE_NAME } from "@/lib/seo/metadata";
import { getBaseUrl } from "@/lib/seo/site";

import "./globals.css";

const DESCRIPTION =
  "Encuentra habitación, piso o compañeros de piso con perfiles y reseñas verificadas tras una estancia real.";

// Dinámico: lee la URL pública y la variable de indexación en cada petición.
export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: "Convivo · Pisos y habitaciones con reseñas reales",
      template: "%s · Convivo",
    },
    description: DESCRIPTION,
    applicationName: "Convivo",
    appleWebApp: { capable: true, title: "Convivo", statusBarStyle: "default" },
    // Web de pruebas (indexación apagada): ninguna página se indexa. El
    // middleware repite lo mismo en la cabecera X-Robots-Tag.
    robots: isIndexingEnabled() ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "es_ES",
      title: "Convivo · Pisos y habitaciones con reseñas reales",
      description: DESCRIPTION,
      images: [{ url: "/og/inicio", width: 1200, height: 630, alt: "Convivo: tu próximo hogar, con gente de confianza" }],
    },
    twitter: { card: "summary_large_image", images: ["/og/inicio"] },
  };
}

export const viewport: Viewport = {
  themeColor: "#7b4b2a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        {/* pb-24 en móvil: deja sitio a la barra de pestañas inferior. Visible
            también en móvil para que privacidad y condiciones estén a mano. */}
        <footer className="border-t border-border bg-surface pb-24 sm:pb-0 print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
            <Logo />
            <nav aria-label="Pie de página" className="flex flex-wrap gap-5">
              <Link href="/anuncios" className="hover:text-brand">Buscar</Link>
              <Link href="/publicar" className="hover:text-brand">Publicar</Link>
              <Link href="/registro" className="hover:text-brand">Crear cuenta</Link>
              <Link href="/privacidad" className="hover:text-brand">Privacidad</Link>
              <Link href="/terminos" className="hover:text-brand">Condiciones</Link>
              <Link href="/denunciar" className="hover:text-brand">Denunciar contenido</Link>
            </nav>
            <p>© {new Date().getFullYear()} Convivo · Hecho en España</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
