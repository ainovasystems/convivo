/**
 * Cabeceras de seguridad.
 *
 * La CSP va con un nonce distinto en cada petición (lo pone el middleware), así
 * que los scripts NO necesitan 'unsafe-inline': Next.js añade el nonce a sus
 * propios <script> y 'strict-dynamic' deja cargar los trozos que esos scripts
 * piden. Esto funciona porque todas las páginas se generan en cada petición
 * (la cabecera lee la sesión); una página estática no tendría el nonce.
 *
 * style-src sí lleva 'unsafe-inline': React escribe atributos style="…" (el
 * degradado de la portada, next/image) y a los atributos no se les puede poner
 * nonce. Un estilo inyectado no ejecuta código; el riesgo es mucho menor que en
 * scripts.
 */
export function buildCsp({ nonce, supabaseUrl, dev }: { nonce: string; supabaseUrl?: string; dev: boolean }) {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
  const http = supabase ? supabase.origin : "https://*.supabase.co";
  // Realtime usa WebSocket en el mismo host que la API.
  const ws = supabase ? `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}` : "wss://*.supabase.co";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' solo en desarrollo: lo necesita React para los mensajes de error.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", http],
    "font-src": ["'self'"],
    "connect-src": ["'self'", http, ws, ...(dev ? ["ws:"] : [])],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) csp.push("upgrade-insecure-requests");
  return csp.join("; ");
}

/** Cabeceras fijas para todas las respuestas (next.config.ts). */
export const STATIC_SECURITY_HEADERS = [
  // Dos años, con subdominios. Solo tiene efecto en HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Para navegadores antiguos que no entienden frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
] as const;

/** Nonce aleatorio en base64 (Web Crypto: funciona en el runtime del middleware). */
export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
