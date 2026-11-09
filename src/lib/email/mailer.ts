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
    // El cuerpo explica el motivo (dominio sin verificar, remitente no permitido…): sale en los logs de Vercel.
    if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

/**
 * Se aceptan también `resendkey` y `emailfrom` (algunos paneles no dejan usar
 * mayúsculas ni guiones bajos). Si existen, mandan los nombres en minúscula,
 * igual que con el resto de variables.
 */
export function emailConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    resendKey: env.resendkey || env.RESEND_API_KEY || "",
    from: env.emailfrom || env.EMAIL_FROM || DEFAULT_FROM,
  };
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const { resendKey, from } = emailConfig(env);
  if (resendKey) return new ResendMailer(resendKey, from);
  if (env.MAILPIT_URL) return new MailpitMailer(env.MAILPIT_URL, from);
  return new ConsoleMailer();
}
