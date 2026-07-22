import nodemailer, { type Transporter } from "nodemailer";
import { env, hasSmtp, hasResend } from "./env";

export interface SendResult {
  status: "sent" | "simulated" | "failed";
  messageId: string | null;
  error: string | null;
  provider: "resend" | "smtp" | "none";
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transporter;
}

// CAN-SPAM / GDPR: every real send carries an opt-out line.
const FOOTER =
  "\n\n—\nYou received this because we believe it's relevant to your role. Reply STOP to opt out.";

/**
 * Send an approved email through a real mail provider.
 * Provider order: Resend (API key) → SMTP → simulated.
 * `SIMULATE_SEND=true` forces simulation even when a provider is configured.
 */
export async function sendEmail(opts: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const text = opts.body + FOOTER;
  const from = opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from;

  if (env.simulateSend || (!hasResend() && !hasSmtp())) {
    return {
      status: "simulated",
      messageId: null,
      provider: "none",
      error: env.simulateSend ? "SIMULATE_SEND=true" : "No mail provider configured (set RESEND_API_KEY or SMTP_*)",
    };
  }

  // --- Resend (preferred: simple API, no SMTP setup) ---
  if (hasResend()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text }),
      });
      const data = (await res.json()) as { id?: string; message?: string; name?: string };
      if (!res.ok) {
        return { status: "failed", messageId: null, provider: "resend", error: data.message || `Resend HTTP ${res.status}` };
      }
      return { status: "sent", messageId: data.id ?? null, provider: "resend", error: null };
    } catch (e) {
      return { status: "failed", messageId: null, provider: "resend", error: (e as Error).message };
    }
  }

  // --- SMTP fallback ---
  try {
    const info = await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, text });
    return { status: "sent", messageId: info.messageId ?? null, provider: "smtp", error: null };
  } catch (e) {
    return { status: "failed", messageId: null, provider: "smtp", error: (e as Error).message };
  }
}
