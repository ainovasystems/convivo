import { beforeEach, describe, expect, it, vi } from "vitest";

/** Arreglos de la auditoría 3: registro (I10), retirada de una reseña propia (I11) y denuncias (I13). */

vi.mock("server-only", () => ({}));

const signUpMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: signUpMock }, rpc: rpcMock }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/security/rate-limit", () => ({
  authAttemptAllowed: async () => true,
  recordLoginFailure: async () => undefined,
  TOO_MANY_ATTEMPTS: "Demasiados intentos.",
}));
vi.mock("@/lib/signals", () => ({ recordSignal: async () => undefined, getClientIp: async () => "203.0.113.7", getSignalSecret: () => "secreto" }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: async () => "https://pruebas.example.test" }));
vi.mock("@/lib/auth", () => ({ getRecoveryUser: async () => null, getCurrentUser: async () => null }));
vi.mock("@/lib/email/mailer", () => ({ getMailer: () => ({ send: async () => undefined }) }));

import { signUp } from "@/app/(auth)/actions";
import { submitNotice } from "@/app/denunciar/actions";
import { withdrawalDecisionEmail } from "@/lib/email/templates";
import { initialFormState } from "@/lib/forms";
import {
  absoluteNoticeUrl,
  checkNoticeUrl,
  noticeAllowedHosts,
  NOTICE_URL_MISSING,
  NOTICE_URL_NOT_A_LINK,
} from "@/lib/moderation/notices";
import { REPORT_REASONS, WITHDRAWAL_REASON, withdrawalRequestSchema } from "@/lib/reviews/schema";
import { SIGN_UP_SENT_MESSAGE } from "@/lib/validation/auth";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("registro: misma respuesta exista o no la cuenta (I10)", () => {
  const data = () => form({ displayName: "Lucía", email: "lucia@example.com", password: "una-clave-larga", isAdult: "on", acceptTerms: "on" });
  beforeEach(() => signUpMock.mockReset());

  it("responde exactamente igual con un email nuevo, con uno que ya tiene cuenta y si Supabase lo dice o limita el envío", async () => {
    // «Confirm email» activado, email nuevo: usuario sin sesión.
    signUpMock.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{}] }, session: null }, error: null });
    const nuevo = await signUp(initialFormState, data());
    // «Confirm email» activado, email con cuenta: Supabase devuelve un usuario falso, sin identidades ni sesión.
    signUpMock.mockResolvedValueOnce({ data: { user: { id: "u2", identities: [] }, session: null }, error: null });
    const existente = await signUp(initialFormState, data());
    // Sin confirmación (local): Supabase sí dice que existe.
    signUpMock.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: "user_already_exists", status: 422 } });
    const existenteLocal = await signUp(initialFormState, data());
    // Límite de envío de emails (solo salta con emails nuevos).
    signUpMock.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: "over_email_send_rate_limit", status: 429 } });
    const limitado = await signUp(initialFormState, data());

    expect(nuevo).toEqual({ status: "success", message: SIGN_UP_SENT_MESSAGE });
    expect(existente).toEqual(nuevo);
    expect(existenteLocal).toEqual(nuevo);
    expect(limitado).toEqual(nuevo);
  });

  it("el mensaje no repite el email ni dice que la cuenta exista", () => {
    expect(SIGN_UP_SENT_MESSAGE).not.toMatch(/ya existe|@/i);
  });

  it("con sesión inmediata (confirmación desactivada, solo en local) lleva a completar el perfil", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: { id: "u3" }, session: { access_token: "x" } }, error: null });
    await expect(signUp(initialFormState, data())).rejects.toThrow("REDIRECT:/perfil/editar?bienvenida=1");
  });
});

describe("denuncias: solo enlaces de Hommie (I13)", () => {
  const hosts = noticeAllowedHosts("https://pruebas.example.test");
  const ID = "a0000000-0000-4000-8000-000000000001";

  it("admite hommie.es, www.hommie.es y el dominio de la propia web", () => {
    expect(hosts).toEqual(["hommie.es", "www.hommie.es", "pruebas.example.test"]);
    for (const url of [
      `https://hommie.es/anuncios/${ID}`,
      `https://www.hommie.es/perfil/${ID}`,
      `https://pruebas.example.test/anuncios/${ID}?x=1`,
      `http://pruebas.example.test/`,
    ]) {
      expect(checkNoticeUrl(url, hosts)).toEqual({ ok: true, url });
    }
    // Sin «https://» delante también vale si es de Hommie.
    expect(checkNoticeUrl(`hommie.es/anuncios/${ID}`, hosts)).toEqual({ ok: true, url: `https://hommie.es/anuncios/${ID}` });
  });

  it.each([
    "https://www.google.com/",
    "google.com",
    "https://hommie.es.estafa.example/anuncios/1",
    "https://hommie.es@estafa.example/anuncios/1",
    "https://estafa.example/?u=https://hommie.es/anuncios/1",
    "https://otra.example.test/",
  ])("rechaza el enlace ajeno %s y dice que no es de Hommie", (url) => {
    const r = checkNoticeUrl(url, hosts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no es de Hommie/);
  });

  it.each(["hola, este anuncio es falso", "anuncio", `/anuncios/${ID}`, "javascript:alert(1)", "ftp://hommie.es/x"])(
    "rechaza «%s» porque no es un enlace",
    (text) => {
      expect(checkNoticeUrl(text, hosts)).toEqual({ ok: false, error: NOTICE_URL_NOT_A_LINK });
    },
  );

  it("vacío: pide el enlace", () => {
    expect(checkNoticeUrl("   ", hosts)).toEqual({ ok: false, error: NOTICE_URL_MISSING });
  });

  it("los enlaces internos «Notificar…» llegan como ruta y se completan con el dominio de la web", () => {
    expect(absoluteNoticeUrl(`/anuncios/${ID}`, "https://pruebas.example.test/")).toBe(`https://pruebas.example.test/anuncios/${ID}`);
    expect(absoluteNoticeUrl("//estafa.example/x", "https://pruebas.example.test")).toBe("//estafa.example/x");
    expect(absoluteNoticeUrl("https://www.google.com/", "https://pruebas.example.test")).toBe("https://www.google.com/");
  });

  describe("en el servidor", () => {
    const base = {
      reason: "fraud",
      explanation: "Me pidieron la fianza por adelantado antes de ver la habitación.",
      name: "Rosa",
      email: "rosa@example.com",
      goodFaith: "on",
    };
    beforeEach(() => rpcMock.mockReset());

    it("con un enlace ajeno o un texto no se registra nada y se dice qué falta", async () => {
      for (const url of ["https://www.google.com/", "esto no es un enlace"]) {
        const state = await submitNotice(initialFormState, form({ ...base, url }));
        expect(state.status).toBe("error");
        expect(state.errors?.url).toBeTruthy();
        expect(state.values?.url).toBe(url);
      }
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("con un enlace de la web se registra", async () => {
      rpcMock.mockResolvedValueOnce({ data: "E6D1D0B7", error: null });
      const state = await submitNotice(initialFormState, form({ ...base, url: `https://pruebas.example.test/anuncios/${ID}` }));
      expect(state.status).toBe("success");
      expect(rpcMock).toHaveBeenCalledWith(
        "submit_legal_notice",
        expect.objectContaining({ p_target_type: "listing", p_target_id: ID, p_target_url: `https://pruebas.example.test/anuncios/${ID}` }),
      );
    });
  });
});

describe("solicitud de retirada de una reseña propia (I11)", () => {
  const reviewId = "a0000000-0000-4000-8000-000000000009";

  it("el motivo es obligatorio (10 a 1000 caracteres)", () => {
    expect(withdrawalRequestSchema.safeParse({ reviewId, reason: "" }).success).toBe(false);
    expect(withdrawalRequestSchema.safeParse({ reviewId, reason: "   corto   " }).success).toBe(false);
    expect(withdrawalRequestSchema.safeParse({ reviewId, reason: "x".repeat(1001) }).success).toBe(false);
    expect(withdrawalRequestSchema.safeParse({ reviewId, reason: null }).success).toBe(false);
    expect(withdrawalRequestSchema.parse({ reviewId, reason: "  Me equivoqué de persona  " }).reason).toBe("Me equivoqué de persona");
  });

  it("no es un motivo que se pueda elegir al denunciar la reseña de otra persona", () => {
    expect(Object.keys(REPORT_REASONS)).not.toContain(WITHDRAWAL_REASON);
  });

  it("el email de la decisión dice si se retira o no, con el motivo escapado", () => {
    const ok = withdrawalDecisionEmail({ name: "Ana", accepted: true, note: "Te equivocaste <b>de</b> persona", url: "https://hommie.es/mis-resenas" });
    expect(ok.subject).toBe("Hemos retirado tu reseña en Hommie");
    expect(ok.html).toContain("Te equivocaste &lt;b&gt;de&lt;/b&gt; persona");
    expect(ok.text).toContain("https://hommie.es/mis-resenas");
    const no = withdrawalDecisionEmail({ name: "Ana", accepted: false, note: "La reseña es veraz", url: "https://hommie.es/mis-resenas" });
    expect(no.subject).toBe("No hemos retirado tu reseña en Hommie");
    expect(no.text).toContain("sigue como estaba");
    expect(no.text).toContain("La reseña es veraz");
  });
});
