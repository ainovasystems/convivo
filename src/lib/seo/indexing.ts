/**
 * Control de la indexación (que Google y otros buscadores nos indexen).
 *
 * UNA sola variable de entorno lo gobierna: `INDEXING_ENABLED`
 * (alias `indexing`, por los paneles que no admiten mayúsculas ni guiones
 * bajos; si existe el alias manda, igual que el resto de alias del proyecto).
 *
 *  - Apagada (por defecto, y con cualquier valor que no sea «true»/«1»/«si»):
 *    TODAS las páginas llevan `noindex, nofollow` (cabecera X-Robots-Tag y
 *    <meta robots>) y robots.txt bloquea todo. Es el modo de la web de pruebas.
 *  - Encendida: se indexa lo público, y siguen con noindex las rutas privadas,
 *    los perfiles de personas y las búsquedas filtradas (ver `robotsTagFor`).
 *
 * Este fichero no importa nada del servidor: lo usa el middleware (runtime
 * edge) y los tests.
 */

type Env = Record<string, string | undefined>;

const TRUTHY = new Set(["true", "1", "si", "sí", "yes"]);

export function isIndexingEnabled(env: Env = process.env): boolean {
  // `||` y no `??`: un alias vacío en el panel no debe tapar a la variable estándar.
  const raw = env.indexing || env.INDEXING_ENABLED;
  return raw ? TRUTHY.has(raw.trim().toLowerCase()) : false;
}

/**
 * Rutas que nunca se indexan, aunque se encienda la indexación: zonas con
 * sesión, formularios de acceso, perfiles de personas (decisión de producto:
 * los perfiles no se indexan) y herramientas internas.
 */
export const NEVER_INDEXED_PREFIXES = [
  "/perfil",
  "/perfil/editar",
  "/publicar",
  "/mis-",
  "/mensajes",
  "/admin",
  "/resenas",
  "/cuenta",
  "/contratos",
  "/entrar",
  "/registro",
  "/auth",
  "/api",
  "/estado",
  "/denunciar",
  "/og",
] as const;

const NOINDEX = "noindex, nofollow";

function pathMatches(pathname: string, prefix: string) {
  return prefix.endsWith("-") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNeverIndexedPath(pathname: string): boolean {
  return NEVER_INDEXED_PREFIXES.some((p) => pathMatches(pathname, p));
}

/**
 * Valor de la cabecera X-Robots-Tag para una petición, o null si se puede
 * indexar. Un solo sitio decide, y el middleware la pone en todas las
 * respuestas (también en las que no son HTML).
 */
export function robotsTagFor(pathname: string, search: string, enabled: boolean): string | null {
  if (!enabled) return NOINDEX;
  if (isNeverIndexedPath(pathname)) return NOINDEX;
  // Búsqueda con filtros u orden: infinitas combinaciones duplicadas. Se
  // siguen los enlaces (para llegar a los anuncios), pero la URL no se indexa.
  if (pathname === "/anuncios" && search && search !== "?") return "noindex, follow";
  return null;
}

/** Rutas de robots.txt cuando la indexación está encendida. */
export const ROBOTS_DISALLOW = [
  "/api/",
  "/auth/",
  "/admin",
  "/perfil",
  "/publicar",
  "/mis-anuncios",
  "/mis-estancias",
  "/mis-resenas",
  "/mensajes",
  "/resenas",
  "/cuenta",
  "/contratos",
  "/entrar",
  "/registro",
  "/estado",
  "/denunciar",
  "/og/",
] as const;
