import { describe, expect, it } from "vitest";

import { buildCsp, createNonce, STATIC_SECURITY_HEADERS } from "@/lib/security/headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("CSP", () => {
  const csp = buildCsp({ nonce: "abc123", supabaseUrl: "https://xyz.supabase.co", dev: false });

  it("los scripts van con nonce y sin 'unsafe-inline' ni 'unsafe-eval'", () => {
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
  });

  it("deja hablar con Supabase por https y wss (Realtime) y cargar sus fotos", () => {
    expect(directive(csp, "connect-src")).toContain("https://xyz.supabase.co");
    expect(directive(csp, "connect-src")).toContain("wss://xyz.supabase.co");
    expect(directive(csp, "img-src")).toContain("https://xyz.supabase.co");
  });

  it("impide que otra web nos meta en un iframe y bloquea plugins", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("en local admite Supabase por http/ws y eval de desarrollo", () => {
    const dev = buildCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", dev: true });
    expect(directive(dev, "connect-src")).toContain("ws://127.0.0.1:54321");
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("el nonce cambia en cada petición", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("incluye HSTS, nosniff, Referrer-Policy, Permissions-Policy y X-Frame-Options", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining(["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]),
    );
  });
});
