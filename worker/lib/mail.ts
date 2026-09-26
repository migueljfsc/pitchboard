/**
 * Transactional email: the verification and reset links, and nothing else (D109).
 *
 * WHY RESEND. Cloudflare's own Email Service sends to arbitrary recipients only on Workers
 * Paid; Resend's free tier (3,000 a month, 100 a day) sends from any domain whose DNS it can
 * verify, and those records live in the OpenTofu stack. The provider is this one function, so
 * moving is one file.
 *
 * THE WORKER HAS NO LOCALE (D38), so the words are here rather than in `src/i18n/`: the client
 * says which language it is reading in, and an unknown value reads as English.
 */

export type MailLang = "en" | "pt";

export const mailLang = (value: unknown): MailLang => (value === "pt" ? "pt" : "en");

type Purpose = "verify" | "reset";

const COPY: Record<MailLang, Record<Purpose, { subject: string; body: string; action: string }>> = {
  en: {
    verify: {
      subject: "Confirm your email for Pitchboard",
      body: "Open this link to confirm your address and finish setting your Pitchboard password. It expires in 24 hours.",
      action: "Confirm email",
    },
    reset: {
      subject: "Reset your Pitchboard password",
      body: "Open this link to choose a new Pitchboard password. It expires in 1 hour.",
      action: "Choose a new password",
    },
  },
  pt: {
    verify: {
      subject: "Confirme o seu email no Pitchboard",
      body: "Abra esta ligação para confirmar o seu endereço e concluir a definição da sua palavra-passe do Pitchboard. Expira em 24 horas.",
      action: "Confirmar email",
    },
    reset: {
      subject: "Redefinir a palavra-passe do Pitchboard",
      body: "Abra esta ligação para escolher uma nova palavra-passe do Pitchboard. Expira em 1 hora.",
      action: "Escolher nova palavra-passe",
    },
  },
};

const IGNORE: Record<MailLang, string> = {
  en: "If you did not ask for this, ignore this email and nothing will change.",
  pt: "Se não pediu isto, ignore este email e nada será alterado.",
};

/** The link is built by this Worker from a token and its own origin, but it is escaped anyway. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function composeMail(purpose: Purpose, lang: MailLang, link: string) {
  const copy = COPY[lang][purpose];
  const text = `${copy.body}\n\n${link}\n\n${IGNORE[lang]}\n`;
  const href = escapeHtml(link);
  const html =
    `<p>${escapeHtml(copy.body)}</p>` +
    `<p><a href="${href}">${escapeHtml(copy.action)}</a></p>` +
    `<p style="color:#666;font-size:12px">${escapeHtml(IGNORE[lang])}</p>`;
  return { subject: copy.subject, text, html };
}

/**
 * Throws on failure. Callers send from `waitUntil`, after the response has gone, so a failure
 * is logged rather than reported — the response to "send me a link" must read the same whether
 * or not the address has an account, and a fast error for one case would say which it is.
 */
export async function sendMail(
  env: Env,
  to: string,
  mail: { subject: string; text: string; html: string },
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], ...mail }),
  });
  if (!response.ok) throw new Error(`mail_failed_${response.status}`);
}
