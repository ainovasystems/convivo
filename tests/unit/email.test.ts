import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ConsoleMailer, emailConfig, getMailer, MailpitMailer, ResendMailer } from "@/lib/email/mailer";
import { escapeHtml, interestAcceptedEmail, newInterestEmail, stayProposedEmail } from "@/lib/email/templates";

describe("plantillas de email", () => {
  it("escapan el contenido del usuario (sin inyección de HTML)", () => {
    const e = newInterestEmail({
      ownerName: "Ana",
      guestName: "<script>alert(1)</script>",
      listingTitle: "Piso <b>",
      message: 'Hola "amigo" & <img src=x>',
      url: "https://convivo.es/mensajes/1",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img src=x>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.text).toContain("https://convivo.es/mensajes/1");
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });

  it("generan asunto y texto en español", () => {
    expect(interestAcceptedEmail({ guestName: "Bea", ownerName: "Ana", listingTitle: "Hab.", url: "u" }).subject).toBe(
      "Ana ha aceptado tu interés en «Hab.»",
    );
    const s = stayProposedEmail({
      recipientName: "Ana",
      proposerName: "Bea",
      listingTitle: "Hab.",
      startDate: "1 dic 2026",
      endDate: null,
      url: "u",
    });
    expect(s.text).toContain("a partir del 1 dic 2026");
  });
});

describe("getMailer", () => {
  it("elige proveedor según el entorno", () => {
    expect(getMailer({ RESEND_API_KEY: "k" } as never)).toBeInstanceOf(ResendMailer);
    expect(getMailer({ MAILPIT_URL: "http://localhost:54324" } as never)).toBeInstanceOf(MailpitMailer);
    expect(getMailer({} as never)).toBeInstanceOf(ConsoleMailer);
  });

  it("acepta resendkey y emailfrom, que mandan sobre los nombres estándar", () => {
    expect(getMailer({ resendkey: "k" } as never)).toBeInstanceOf(ResendMailer);
    expect(emailConfig({ emailfrom: "A <a@x.es>", EMAIL_FROM: "B <b@x.es>" } as never).from).toBe("A <a@x.es>");
    expect(emailConfig({} as never).from).toContain("Convivo");
  });
});
