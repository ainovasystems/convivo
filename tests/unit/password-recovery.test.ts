import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  cameFromEmailLink,
  isRecoveryLink,
  RECOVERY_NEW_PASSWORD_PATH,
  RECOVERY_SENT_MESSAGE,
  RECOVERY_WINDOW_MINUTES,
} from "@/lib/account/password-recovery";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/supabase/middleware";
import { newPasswordSchema, passwordResetRequestSchema, signUpSchema } from "@/lib/validation/auth";

describe("newPasswordSchema", () => {
  it("acepta una contraseña válida escrita dos veces", () => {
    expect(newPasswordSchema.safeParse({ password: "12345678", passwordConfirm: "12345678" }).success).toBe(true);
  });

  it("aplica las mismas reglas que el registro", () => {
    const base = { displayName: "Lucía", email: "l@x.es", isAdult: "on", acceptTerms: "on" };
    for (const password of ["1234567", "x".repeat(73)]) {
      const signUp = signUpSchema.safeParse({ ...base, password });
      const reset = newPasswordSchema.safeParse({ password, passwordConfirm: password });
      expect(signUp.success).toBe(false);
      expect(reset.success).toBe(false);
      expect(reset.error?.issues[0].message).toBe(signUp.error?.issues[0].message);
    }
  });

  it("exige que las dos coincidan y lo marca en la segunda", () => {
    const r = newPasswordSchema.safeParse({ password: "12345678", passwordConfirm: "12345679" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["passwordConfirm"]);
    expect(r.error?.issues[0].message).toBe("Las dos contraseñas no coinciden");
  });
});

describe("passwordResetRequestSchema", () => {
  it("normaliza el email y rechaza lo que no lo es", () => {
    expect(passwordResetRequestSchema.parse({ email: " Ana@Example.COM " }).email).toBe("ana@example.com");
    expect(passwordResetRequestSchema.safeParse({ email: "ana" }).success).toBe(false);
  });
});

describe("cameFromEmailLink (quién puede elegir contraseña nueva)", () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const secondsAgo = (s: number) => Math.floor(now / 1000) - s;

  it.each(["otp", "recovery", "magiclink"])("vale una sesión reciente abierta con un enlace del email (%s)", (method) => {
    expect(cameFromEmailLink([{ method, timestamp: secondsAgo(60) }], now)).toBe(true);
  });

  it("no vale una sesión abierta con la contraseña", () => {
    expect(cameFromEmailLink([{ method: "password", timestamp: secondsAgo(10) }], now)).toBe(false);
  });

  it("no vale un enlace abierto hace más del margen", () => {
    expect(cameFromEmailLink([{ method: "otp", timestamp: secondsAgo(RECOVERY_WINDOW_MINUTES * 60 + 1) }], now)).toBe(false);
    expect(cameFromEmailLink([{ method: "otp", timestamp: secondsAgo(RECOVERY_WINDOW_MINUTES * 60 - 1) }], now)).toBe(true);
  });

  it("no se fía de datos raros", () => {
    for (const amr of [undefined, null, "otp", [], ["otp"], [{ method: "otp" }], [{ method: "otp", timestamp: "ahora" }]]) {
      expect(cameFromEmailLink(amr, now)).toBe(false);
    }
    // Una fecha del futuro no cuenta como «reciente».
    expect(cameFromEmailLink([{ method: "otp", timestamp: secondsAgo(-3600) }], now)).toBe(false);
  });
});

describe("isRecoveryLink (a dónde vuelve un enlace caducado)", () => {
  it("reconoce el enlace de recuperación por el tipo o por su destino", () => {
    expect(isRecoveryLink("recovery", "/")).toBe(true);
    expect(isRecoveryLink(null, RECOVERY_NEW_PASSWORD_PATH)).toBe(true);
    expect(isRecoveryLink("magiclink", "/")).toBe(false);
    expect(isRecoveryLink(null, "/recuperarse")).toBe(false);
  });
});

describe("rutas y textos", () => {
  it("las pantallas de recuperar no exigen sesión ni echan a quien la tiene", () => {
    for (const path of ["/recuperar", "/recuperar/nueva"]) {
      expect(isProtectedPath(path)).toBe(false);
      expect(isGuestOnlyPath(path)).toBe(false);
    }
  });

  it("la respuesta al pedir el enlace no afirma que la cuenta exista", () => {
    expect(RECOVERY_SENT_MESSAGE).toMatch(/^Si hay una cuenta con ese email/);
  });
});

describe("plantilla del email de recuperación", () => {
  const template = readFileSync("supabase/templates/recovery.html", "utf8").trim();

  it("es la misma que se pega en el panel (docs/EMAILS-DE-ACCESO.md)", () => {
    expect(readFileSync("docs/EMAILS-DE-ACCESO.md", "utf8")).toContain(template);
  });

  it("lleva a /auth/callback con el token, el tipo y la pantalla de la contraseña nueva", () => {
    expect(template).toContain(
      `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=${encodeURIComponent(RECOVERY_NEW_PASSWORD_PATH)}`,
    );
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });
});
