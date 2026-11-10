import type { NextConfig } from "next";

import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

/**
 * Nombres alternativos de las variables (algunos paneles no dejan usar
 * mayúsculas ni guiones bajos): projecturl, publickey, secretkey y siteurl.
 * Las públicas se copian a NEXT_PUBLIC_* en el build para que lleguen al
 * navegador; secretkey solo se lee en el servidor (src/lib/supabase/admin.ts).
 * Si existen, los nombres en minúscula MANDAN sobre los estándar: así una
 * integración que cree NEXT_PUBLIC_SUPABASE_URL hacia otro proyecto no pisa
 * la configuración puesta a mano.
 */
const supabaseUrl = process.env.projecturl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.publickey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const siteUrl = process.env.siteurl ?? process.env.NEXT_PUBLIC_SITE_URL;
const publicEnv: Record<string, string> = {};
if (siteUrl) publicEnv.NEXT_PUBLIC_SITE_URL = siteUrl;
if (supabaseUrl) publicEnv.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
if (supabaseAnonKey) publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;

function supabaseImagePattern() {
  const raw = supabaseUrl;
  if (!raw) return { protocol: "https" as const, hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" };
  const url = new URL(raw);
  return {
    protocol: url.protocol.replace(":", "") as "http" | "https",
    hostname: url.hostname,
    port: url.port,
    pathname: "/storage/v1/object/public/**",
  };
}

const nextConfig: NextConfig = {
  env: publicEnv,
  poweredByHeader: false,
  // Metadatos (título, descripción, canonical, Open Graph) SIEMPRE en el <head>.
  // Por defecto Next los envía después, dentro del <body>, a los visitantes que
  // no son buscadores conocidos; WhatsApp, Lighthouse o un rastreador nuevo
  // podrían no leerlos. Cuesta una fracción de TTFB y asegura el SEO técnico.
  htmlLimitedBots: /.*/,
  async headers() {
    // La CSP no va aquí: lleva un nonce por petición y la pone src/middleware.ts.
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
  images: { remotePatterns: [supabaseImagePattern()] },
  experimental: {
    // Subida de avatar (2 MB) por Server Action: el límite por defecto es 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
