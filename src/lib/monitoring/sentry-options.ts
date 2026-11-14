/**
 * Configuración de Sentry (errores y tareas programadas), compartida por el
 * navegador, el servidor y el middleware. Funciones puras: se prueban sin
 * Sentry (tests/unit/sentry.test.ts).
 *
 * Reglas del piloto:
 *   - APAGADO si no hay DSN (`NEXT_PUBLIC_SENTRY_DSN`, alias `sentrydsn`):
 *     no se inicializa nada ni se envía nada.
 *   - Región UE: el DSN debe ser de *.ingest.de.sentry.io (se avisa si no).
 *   - SIN datos personales (`dataCollection` todo apagado, porque en la v11 lo
 *     recoge todo por defecto, y además `scrubEvent`): sin usuario, sin IP, sin cookies ni cabeceras, sin
 *     cuerpo de las peticiones, URLs sin parámetros, y emails, teléfonos e
 *     identificadores tapados en los textos.
 *   - SIN grabación de sesiones (no se añade la integración Replay).
 *   - Muestreo bajo de rendimiento y LÍMITE de envíos para que un bucle de
 *     errores no gaste la cuota del plan gratuito (5.000 errores al mes).
 */
import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";

// Tipo de @sentry/core (dependencia de @sentry/nextjs), para que TypeScript compruebe cada clave.
type DataCollection = NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]["dataCollection"]>;

type Env = Record<string, string | undefined>;

/** DSN de Sentry. Como con las demás variables, el alias en minúscula manda. */
export function getSentryDsn(env: Env = process.env): string | null {
  const raw = (env.sentrydsn || env.NEXT_PUBLIC_SENTRY_DSN || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.username ? raw : null;
  } catch {
    return null;
  }
}

/** Origen al que envía el navegador (para la CSP, connect-src). */
export function sentryIngestOrigin(dsn: string | null): string | null {
  if (!dsn) return null;
  return new URL(dsn).origin;
}

/** El DSN es de la región europea (datos en Alemania). */
export function isEuDsn(dsn: string) {
  return /\.ingest\.de\.sentry\.io$/.test(new URL(dsn).hostname);
}

// ---------------------------------------------------------------------------
// Limpieza de datos personales
// ---------------------------------------------------------------------------
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Teléfonos y otros números largos (DNI, IBAN, tarjetas): 9 o más cifras seguidas, con espacios o guiones opcionales.
const LONG_NUMBER = /(?:\+?\d[\s-]?){9,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/** Tapa en un texto lo que puede identificar a alguien. */
export function maskText(text: string): string {
  return text
    .replace(JWT, "[token]")
    .replace(BEARER, "$1 [token]")
    .replace(EMAIL, "[email]")
    .replace(UUID, "[id]")
    .replace(LONG_NUMBER, "[número]");
}

/** URL sin parámetros ni fragmento, y con los identificadores tapados. */
export function cleanUrl(url: string): string {
  const cut = url.split(/[?#]/)[0];
  return maskText(cut);
}

function cleanValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return maskText(value);
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => cleanValue(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanValue(v, depth + 1)]));
}

/** Quita del evento todo lo que pueda ser un dato personal. Muta y devuelve el evento. */
export function scrubEvent<T extends Event>(event: T): T {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? cleanUrl(event.request.url) : undefined,
    };
  }
  if (event.message) event.message = maskText(event.message);
  if (event.transaction) event.transaction = cleanUrl(event.transaction);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = maskText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) {
      delete frame.vars;
      if (frame.abs_path) frame.abs_path = cleanUrl(frame.abs_path);
    }
  }
  if (event.extra) event.extra = cleanValue(event.extra) as Event["extra"];
  if (event.tags) {
    event.tags = Object.fromEntries(Object.entries(event.tags).map(([k, v]) => [k, typeof v === "string" ? maskText(v) : v]));
  }
  if (event.contexts) {
    // Solo contexto técnico (navegador, sistema, entorno de ejecución, traza).
    const { browser, os, runtime, device, trace, response, cloud_resource, culture, app } = event.contexts;
    event.contexts = { browser, os, runtime, device, trace, response, cloud_resource, culture, app };
    if (event.contexts.device) {
      const { family, model, brand, simulator } = event.contexts.device;
      event.contexts.device = { family, model, brand, simulator };
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

/** Migas (lo que pasó antes del error): sin cuerpos, URLs sin parámetros y textos tapados. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Los console.log pueden llevar cualquier cosa: solo se conservan avisos y errores, tapados.
  if (crumb.category === "console" && crumb.level !== "error" && crumb.level !== "warning") return null;
  const out: Breadcrumb = { ...crumb };
  if (out.message) out.message = maskText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      if (k === "url" || k === "from" || k === "to") data[k] = typeof v === "string" ? cleanUrl(v) : v;
      else if (k === "method" || k === "status_code" || k === "reason" || k === "level") data[k] = v;
      // Lo demás (cuerpos, argumentos de console, tamaños) se descarta.
    }
    out.data = data;
  }
  return out;
}

/** Un tramo de rendimiento (span), sin identificadores, parámetros ni datos de quien navega. */
export function scrubSpan<T extends { name: string; attributes?: Record<string, unknown> }>(span: T): T {
  span.name = maskText(span.name.split(/[?#]/)[0]);
  if (span.attributes) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(span.attributes)) {
      // Fuera lo que identifica a la persona: usuario, IP, cabeceras, cuerpos, cookies y consultas.
      if (/user|client\.address|(^|\.)ip($|\.)|header|body|cookie|query|db\.statement|db\.query/i.test(key)) continue;
      out[key] = typeof value === "string" ? (/url|path|target|route/i.test(key) ? cleanUrl(value) : maskText(value)) : value;
    }
    span.attributes = out;
  }
  return span;
}

// ---------------------------------------------------------------------------
// Límite de envíos (un bucle de errores no gasta la cuota del mes)
// ---------------------------------------------------------------------------
/**
 * Ventana deslizante: como mucho `max` eventos cada `windowMs`. En el
 * navegador se usa por pestaña; en el servidor, por instancia. El límite fuerte
 * lo pone además Sentry por clave (ver docs/DEPLOY.md → Sentry).
 */
export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const sent: number[] = [];
  return function allow(): boolean {
    const t = now();
    while (sent.length > 0 && t - sent[0] >= windowMs) sent.shift();
    if (sent.length >= max) return false;
    sent.push(t);
    return true;
  };
}

/** Errores que no son nuestros ni accionables (extensiones, redes caídas, navegación cancelada). */
const IGNORE_ERRORS: (string | RegExp)[] = [
  /ResizeObserver loop/,
  /^Network ?Error$/i,
  /Failed to fetch/,
  /Load failed/,
  /NetworkError when attempting to fetch resource/,
  /AbortError/,
  /NEXT_REDIRECT/,
  /NEXT_NOT_FOUND/,
];

export type SentryRuntime = "browser" | "node" | "edge";

/**
 * Opciones de Sentry.init para cada entorno, o null si Sentry está apagado.
 * El muestreo de rendimiento es bajo (2 %) y nunca se graba la sesión.
 */
export function buildSentryOptions(runtime: SentryRuntime, env: Env = process.env) {
  const dsn = getSentryDsn(env);
  if (!dsn) return null;

  const allow = runtime === "browser" ? createRateLimiter(10, 60 * 60 * 1000) : createRateLimiter(30, 60 * 1000);
  const tracesSampleRate = Math.min(Math.max(Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0.02) || 0, 0), 0.1);

  return {
    dsn,
    environment: env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV || env.NODE_ENV || "development",
    release: env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
    // OJO: en la v11 de Sentry, sin esto se recoge TODO (IP, cookies, cabeceras,
    // cuerpos de las peticiones…). `sendDefaultPii` ya no existe. Se apaga todo y,
    // además, beforeSend vuelve a limpiar el evento por si acaso.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    } satisfies DataCollection,
    sampleRate: 1,
    tracesSampleRate,
    maxBreadcrumbs: 30,
    ignoreErrors: IGNORE_ERRORS,
    beforeSend(event: ErrorEvent): ErrorEvent | null {
      if (!allow()) return null;
      return scrubEvent(event);
    },
    // Rendimiento (v11, spans en streaming): mismo criterio que con los errores.
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
      return scrubBreadcrumb(crumb);
    },
  };
}

/** Configuración del monitor de la tarea diaria de avisos de reseña (vercel.json). */
export const REVIEW_WINDOWS_MONITOR = {
  slug: "review-windows",
  config: {
    schedule: { type: "crontab" as const, value: "17 8 * * *" },
    timezone: "Etc/UTC",
    // Avisa si no ha empezado 30 min después de su hora o si dura más de 10 min.
    checkinMargin: 30,
    maxRuntime: 10,
    failureIssueThreshold: 1,
    recoveryThreshold: 1,
  },
};
