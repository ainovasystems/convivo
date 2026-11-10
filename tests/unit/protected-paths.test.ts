import { describe, expect, it } from "vitest";

import { isGuestOnlyPath, isProtectedPath } from "@/lib/supabase/middleware";

describe("isProtectedPath", () => {
  it.each(["/perfil", "/perfil/editar", "/publicar", "/mis-anuncios", "/mensajes", "/admin", "/cuenta", "/contratos"])(
    "protege %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(["/", "/anuncios", "/perfil/123", "/entrar", "/registro"])("deja pública %s", (path) =>
    expect(isProtectedPath(path)).toBe(false),
  );
});

describe("isGuestOnlyPath", () => {
  it("entrar y registro son solo para visitantes", () => {
    expect(isGuestOnlyPath("/entrar")).toBe(true);
    expect(isGuestOnlyPath("/registro")).toBe(true);
    expect(isGuestOnlyPath("/perfil")).toBe(false);
  });
});
