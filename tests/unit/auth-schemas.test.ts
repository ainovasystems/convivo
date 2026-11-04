import { describe, expect, it } from "vitest";

import { magicLinkSchema, safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";

describe("signUpSchema", () => {
  const valid = { displayName: "  Lucía ", email: " Lucia@Example.COM ", password: "12345678", acceptTerms: "on" };

  it("acepta datos válidos y normaliza nombre y email", () => {
    const r = signUpSchema.parse(valid);
    expect(r.displayName).toBe("Lucía");
    expect(r.email).toBe("lucia@example.com");
  });

  it.each([
    ["displayName", { displayName: "A" }, "al menos 2"],
    ["email", { email: "no-es-email" }, "no parece válido"],
    ["password", { password: "1234567" }, "al menos 8"],
    ["acceptTerms", { acceptTerms: undefined }, "aceptar las condiciones"],
  ])("rechaza %s inválido", (field, override, message) => {
    const r = signUpSchema.safeParse({ ...valid, ...override });
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) => i.path[0] === field);
    expect(issue?.message).toContain(message);
  });
});

describe("signInSchema y magicLinkSchema", () => {
  it("exigen email válido y contraseña no vacía", () => {
    expect(signInSchema.safeParse({ email: "a@b.es", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.es", password: "x" }).success).toBe(true);
    expect(magicLinkSchema.safeParse({ email: "a@b" }).success).toBe(false);
  });
});

describe("safeNextPath (evita redirecciones abiertas)", () => {
  it.each([
    ["/perfil/editar", "/perfil/editar"],
    ["/anuncios?ciudad=lugo", "/anuncios?ciudad=lugo"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["/\\evil.com", "/"],
    [null, "/"],
    [42, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
