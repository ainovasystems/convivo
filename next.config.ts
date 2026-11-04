import type { NextConfig } from "next";

function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
  images: { remotePatterns: [supabaseImagePattern()] },
  experimental: {
    // Subida de avatar (2 MB) por Server Action: el límite por defecto es 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
