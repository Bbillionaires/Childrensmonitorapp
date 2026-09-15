import type { Env } from "@app/config";

export interface EmailSender {
  send(params: { to: string; subject: string; html: string }): Promise<void>;
}

/**
 * Used whenever RESEND_API_KEY is not configured (local dev by default). Clearly labeled —
 * per the project rule against unlabeled mock functionality — and never used when a real
 * key is present.
 */
class ConsoleEmailSender implements EmailSender {
  async send(params: { to: string; subject: string; html: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[MOCK EMAIL — RESEND_API_KEY not configured, nothing was actually sent]\nTo: ${params.to}\nSubject: ${params.subject}\n${params.html}`,
    );
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(params: { to: string; subject: string; html: string }): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send email via Resend: ${response.status} ${body}`);
    }
  }
}

export function createEmailSender(env: Env): EmailSender {
  if (env.RESEND_API_KEY) {
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM ?? "no-reply@example.com");
  }
  return new ConsoleEmailSender();
}
