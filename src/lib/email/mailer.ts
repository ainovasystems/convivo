import "server-only";

export type EmailMessage = { to: string; subject: string; html: string; text: string };

/**
 * Interfaz única de envío. La app solo conoce `Mailer`; cambiar de proveedor
 * es añadir una implementación y elegirla en getMailer().
 */
export interface Mailer {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

const DEFAULT_FROM = "Convivo <no-responder@convivo.es>";

/** Resend (https://resend.com): RESEND_API_KEY y EMAIL_FROM con dominio verificado. */
export class ResendMailer implements Mailer {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(m: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
  }
}

/** Mailpit (incluido en `supabase start`): para ver los emails en local y en los e2e. */
export class MailpitMailer implements Mailer {
  readonly name = "mailpit";
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}
  async send(m: EmailMessage) {
    const match = /^(.*)<(.+)>$/.exec(this.from);
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: match ? match[2].trim() : this.from, Name: match ? match[1].trim() : "" },
        To: [{ Email: m.to }],
        Subject: m.subject,
        HTML: m.html,
        Text: m.text,
      }),
    });
    if (!res.ok) throw new Error(`Mailpit respondió ${res.status}`);
  }
}

/** Sin proveedor: solo deja constancia en el log del servidor. */
export class ConsoleMailer implements Mailer {
  readonly name = "console";
  async send(m: EmailMessage) {
    console.info(`[email] para=${m.to} asunto="${m.subject}"`);
  }
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const from = env.EMAIL_FROM || DEFAULT_FROM;
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, from);
  if (env.MAILPIT_URL) return new MailpitMailer(env.MAILPIT_URL, from);
  return new ConsoleMailer();
}
