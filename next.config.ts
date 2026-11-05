import type { NextConfig } from "next";

/**
 * Nombres alternativos de las variables (algunos paneles no dejan usar
 * mayúsculas ni guiones bajos): projecturl, publickey, secretkey y siteurl.
 * Las públicas se copian a NEXT_PUBLIC_* en el build para que lleguen al
 * navegador; secretkey solo se lee en el servidor (src/lib/supabase/admin.ts).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.projecturl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.publickey;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.siteurl;
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
  images: { remotePatterns: [supabaseImagePattern()] },
  experimental: {
    // Subida de avatar (2 MB) por Server Action: el límite por defecto es 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
