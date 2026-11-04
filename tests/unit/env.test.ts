import { describe, expect, it } from "vitest";

import { publicEnvSchema } from "@/lib/env";

describe("publicEnvSchema", () => {
  it("acepta una configuración válida", () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una URL inválida o una clave vacía", () => {
    expect(
      publicEnvSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "no-es-una-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }).success,
    ).toBe(false);
    expect(
      publicEnvSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }).success,
    ).toBe(false);
  });
});
