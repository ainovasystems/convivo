import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildSentryOptions,
  cleanUrl,
  createRateLimiter,
  getSentryDsn,
  isEuDsn,
  maskText,
  REVIEW_WINDOWS_MONITOR,
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
  sentryIngestOrigin,
} from "@/lib/monitoring/sentry-options";
import { buildCsp } from "@/lib/security/headers";

const DSN = "https://abc123@o4500000000000001.ingest.de.sentry.io/4500000000000002";

describe("Sentry apagado sin clave", () => {
  it("sin DSN no hay opciones (no se inicializa nada)", () => {
    expect(getSentryDsn({})).toBeNull();
    expect(buildSentryOptions("browser", {})).toBeNull();
    expect(buildSentryOptions("node", { NEXT_PUBLIC_SENTRY_DSN: "  " })).toBeNull();
    expect(buildSentryOptions("edge", { NEXT_PUBLIC_SENTRY_DSN: "no-es-una-url" })).toBeNull();
    // Un DSN sin clave o sin https no vale.
    expect(getSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "http://abc@o1.ingest.de.sentry.io/1" })).toBeNull();
    expect(getSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "https://o1.ingest.de.sentry.io/1" })).toBeNull();
  });

  it("el alias en minúscula manda, como con las demás variables", () => {
    expect(getSentryDsn({ sentrydsn: DSN, NEXT_PUBLIC_SENTRY_DSN: "https://x@o2.ingest.sentry.io/2" })).toBe(DSN);
  });

  it("la CSP solo deja conectar con Sentry si hay DSN", () => {
    const off = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co", dev: false, sentryOrigin: sentryIngestOrigin(null) });
    expect(off).not.toContain("sentry.io");
    const on = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co", dev: false, sentryOrigin: sentryIngestOrigin(DSN) });
    expect(on).toMatch(/connect-src [^;]*https:\/\/o4500000000000001\.ingest\.de\.sentry\.io/);
  });

  it("distingue la región europea", () => {
    expect(isEuDsn(DSN)).toBe(true);
    expect(isEuDsn("https://abc@o1.ingest.us.sentry.io/1")).toBe(false);
  });
});

describe("sin datos personales", () => {
  const options = buildSentryOptions("node", { NEXT_PUBLIC_SENTRY_DSN: DSN, NODE_ENV: "production" })!;

  it("no recoge usuario, IP, cookies, cabeceras, cuerpos ni parámetros", () => {
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
    expect(options.tracesSampleRate).toBeLessThanOrEqual(0.1);
    // Sin grabación de sesiones: no se añade ninguna integración.
    expect("integrations" in options).toBe(false);
    expect("replaysSessionSampleRate" in options).toBe(false);
  });

  it("tapa emails, teléfonos, identificadores y tokens en los textos", () => {
    const text = maskText(
      "Fallo para ana.lopez@gmail.com (tel. +34 612 345 678) en el perfil 3f2b1c4d-1111-4222-8333-444455556666 con Bearer eyJhbGciOi.eyJzdWIi.abc",
    );
    expect(text).not.toMatch(/ana\.lopez|612|3f2b1c4d|eyJ/);
    expect(text).toContain("[email]");
    expect(text).toContain("[id]");
  });

  it("las URLs pierden los parámetros y los identificadores", () => {
    expect(cleanUrl("https://convivo.es/perfil/3f2b1c4d-1111-4222-8333-444455556666?email=a@b.es#x")).toBe("https://convivo.es/perfil/[id]");
    expect(cleanUrl("/anuncios?ciudad=Lugo&precio_max=300")).toBe("/anuncios");
  });

  it("el evento sale sin usuario, cabeceras, cookies ni cuerpo", () => {
    const event = scrubEvent({
      message: "Error con pepe@correo.es",
      user: { id: "u1", email: "pepe@correo.es", ip_address: "81.0.0.1" },
      server_name: "maquina-interna",
      request: {
        method: "POST",
        url: "https://convivo.es/entrar?next=/cuenta&email=pepe@correo.es",
        headers: { cookie: "sb-access-token=secreto", "x-forwarded-for": "81.0.0.1", authorization: "Bearer x" },
        cookies: { "sb-access-token": "secreto" },
        data: { password: "1234", email: "pepe@correo.es" },
        query_string: "email=pepe@correo.es",
      },
      exception: {
        values: [{ type: "Error", value: "No existe el usuario pepe@correo.es", stacktrace: { frames: [{ filename: "a.js", vars: { email: "pepe@correo.es" } }] } }],
      },
      extra: { email: "pepe@correo.es", nested: { phone: "612345678" } },
      contexts: { os: { name: "Linux" }, profile: { email: "pepe@correo.es" } as never },
    });
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/pepe|81\.0\.0\.1|secreto|1234|612345678|maquina-interna/);
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ method: "POST", url: "https://convivo.es/entrar" });
    expect(event.contexts?.os).toEqual({ name: "Linux" });
  });

  it("las migas: fuera los console.log y los cuerpos, URLs sin parámetros", () => {
    expect(scrubBreadcrumb({ category: "console", level: "log", message: "usuario pepe@correo.es" })).toBeNull();
    const fetch = scrubBreadcrumb({
      category: "fetch",
      data: { url: "https://x.supabase.co/rest/v1/profiles?id=eq.3f2b1c4d-1111-4222-8333-444455556666", method: "GET", status_code: 200, request_body: "{}" },
    });
    expect(fetch?.data).toEqual({ url: "https://x.supabase.co/rest/v1/profiles", method: "GET", status_code: 200 });
    const nav = scrubBreadcrumb({ category: "navigation", data: { from: "/anuncios?ciudad=Lugo", to: "/perfil/3f2b1c4d-1111-4222-8333-444455556666" } });
    expect(nav?.data).toEqual({ from: "/anuncios", to: "/perfil/[id]" });
  });

  it("beforeSend limpia y beforeSend corta un bucle de errores", () => {
    const browser = buildSentryOptions("browser", { NEXT_PUBLIC_SENTRY_DSN: DSN })!;
    const sent = Array.from({ length: 25 }, () => browser.beforeSend({ type: undefined, message: "x@y.es" }));
    expect(sent.filter(Boolean)).toHaveLength(10);
    expect(sent[0]?.message).toBe("[email]");
  });
});

describe("rendimiento (spans)", () => {
  it("sin parámetros, identificadores ni datos de quien navega", () => {
    const span = scrubSpan({
      name: "GET /perfil/3f2b1c4d-1111-4222-8333-444455556666?email=a@b.es",
      attributes: {
        "url.full": "https://convivo.es/anuncios?ciudad=Lugo",
        "http.request.header.cookie": "sb=secreto",
        "client.address": "81.0.0.1",
        "user.email": "a@b.es",
        "url.query": "ciudad=Lugo",
        "db.statement": "select * from profiles where email = 'a@b.es'",
        "http.response.status_code": 200,
      },
    });
    expect(span.name).toBe("GET /perfil/[id]");
    expect(span.attributes).toEqual({ "url.full": "https://convivo.es/anuncios", "http.response.status_code": 200 });
  });
});

describe("límite de envíos", () => {
  it("deja pasar N eventos por ventana y vuelve a abrir al pasar el tiempo", () => {
    let t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    t = 999;
    expect(allow()).toBe(false);
    t = 1000;
    expect(allow()).toBe(true);
  });
});

describe("monitor de la tarea programada", () => {
  it("usa el mismo horario que vercel.json", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/review-windows");
    expect(REVIEW_WINDOWS_MONITOR.config.schedule.value).toBe(cron?.schedule);
  });
});
