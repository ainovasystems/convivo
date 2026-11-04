import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/supabase/middleware";

describe("isProtectedPath", () => {
  it.each(["/perfil/editar", "/publicar", "/mis-anuncios", "/mis-reseñas"])(
    "protege %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(["/", "/anuncios", "/perfil/123", "/entrar"])(
    "deja pública %s",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});
