import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Convivo · Vivienda compartida con reseñas reales",
    template: "%s · Convivo",
  },
  description:
    "Encuentra habitación, piso o compañeros de piso con perfiles y reseñas verificadas tras una estancia real.",
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-background focus:px-3 focus:py-2"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-sm text-muted">
          © {new Date().getFullYear()} Convivo
        </footer>
      </body>
    </html>
  );
}
