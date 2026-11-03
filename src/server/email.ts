// Sending email: through a Gmail account with an App Password (D-046) when GMAIL_USER and
// GMAIL_APP_PASSWORD are set, otherwise through Resend (D-023) when RESEND_API_KEY and
// EMAIL_FROM are set. Without either, the app shows links to copy instead (D-002).

export type Email = {
  /** One address, or several (a meeting's To list, D-043). */
  to: string | string[];
  /** Copied (a meeting's CC list, D-043). */
  cc?: string[];
  subject: string;
  text: string;
  /** An HTML version (booking emails, D-042); `text` stays for plain-text mail apps. */
  html?: string;
  /** Files sent with it, e.g. a calendar invite (F22). */
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];
  /** Where a reply goes (e.g. the rep, for booking emails). */
  replyTo?: string;
};

function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

/** Emails can go out: through Gmail (D-046) or Resend (D-023). */
export function emailConfigured(): boolean {
  return gmailConfigured() || resendConfigured();
}

/** Gmail only sends as the account itself: EMAIL_FROM when it uses that address (D-046). */
export function gmailFrom(): string {
  const user = process.env.GMAIL_USER!.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return from && from.toLowerCase().includes(user.toLowerCase()) ? from : `Lumor <${user}>`;
}

type Transport = { sendMail: (m: Record<string, unknown>) => Promise<unknown> };

/** Sends one email through Gmail's mail server with an App Password (D-046). */
export type SendResult = { ok: boolean; error?: string };

/** Why Gmail refused, in plain words (never the password). */
function gmailProblem(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(msg)) {
    return "Gmail refused the login. Check GMAIL_USER is the full address and GMAIL_APP_PASSWORD is the 16-letter App Password (not the normal password).";
  }
  if (/Application-specific password required|534/i.test(msg)) {
    return "Gmail needs an App Password: turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords.";
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return "Couldn't reach Gmail's mail server. Try again in a minute.";
  }
  return `Gmail said: ${msg.slice(0, 200)}`;
}

async function sendWithGmail(email: Email, transport?: Transport): Promise<SendResult> {
  const to = Array.isArray(email.to) ? email.to : [email.to];
  try {
    const t =
      transport ??
      (await import("nodemailer")).createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.GMAIL_USER!.trim(),
          // Google shows the App Password in groups of 4; the spaces don't matter.
          pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
        },
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
    await t.sendMail({
      from: gmailFrom(),
      to,
      ...(email.cc?.length ? { cc: email.cc } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.attachments?.length
        ? {
            attachments: email.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
    });
    return { ok: true };
  } catch (e) {
    console.error(`Email to ${to.join(", ")} failed (Gmail):`, e instanceof Error ? e.message : e);
    return { ok: false, error: gmailProblem(e) };
  }
}

/**
 * Sends one email: through Gmail when it's set up (D-046), otherwise Resend. Returns false (and
 * logs why, without secrets) if it couldn't be sent.
 */
export async function sendEmail(
  email: Email,
  fetcher: typeof fetch = fetch,
  transport?: Transport,
): Promise<boolean> {
  return (await sendEmailResult(email, fetcher, transport)).ok;
}

/** How emails go out right now, for the test button (D-047). */
export function emailSetup(): { via: "Gmail" | "Resend" | null; from: string | null } {
  if (gmailConfigured()) return { via: "Gmail", from: gmailFrom() };
  if (resendConfigured()) return { via: "Resend", from: process.env.EMAIL_FROM!.trim() };
  return { via: null, from: null };
}

/** Sends one email and says why it failed, if it did (D-047). */
export async function sendEmailResult(
  email: Email,
  fetcher: typeof fetch = fetch,
  transport?: Transport,
): Promise<SendResult> {
  if (gmailConfigured()) return sendWithGmail(email, transport);
  if (!resendConfigured()) {
    return {
      ok: false,
      error:
        "Email isn't set up on this site: add GMAIL_USER and GMAIL_APP_PASSWORD on Netlify, then deploy again.",
    };
  }
  try {
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: Array.isArray(email.to) ? email.to : [email.to],
        ...(email.cc?.length ? { cc: email.cc } : {}),
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString(
                  "base64",
                ),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Email to ${String(email.to)} failed: Resend answered ${res.status}.`);
      return { ok: false, error: `Resend refused it (status ${res.status}).` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`Email to ${String(email.to)} failed:`, e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't reach Resend. Try again in a minute." };
  }
}

const SIGNATURE = "\n\n— Lumor Sales Hub";

export const emails = {
  invite: (to: string, link: string): Email => ({
    to,
    subject: "You're invited to Lumor Sales Hub",
    text: `You've been invited to Lumor Sales Hub. Set your name and password here (the link works once, for 7 days):\n\n${link}${SIGNATURE}`,
  }),
  reset: (to: string, link: string): Email => ({
    to,
    subject: "Reset your Lumor Sales Hub password",
    text: `Set a new password here (the link works once, for 24 hours):\n\n${link}\n\nIf you didn't expect this, ignore this email.${SIGNATURE}`,
  }),
  verify: (to: string, link: string): Email => ({
    to,
    subject: "Confirm your email for Lumor Sales Hub",
    text: `Confirm your email to finish creating your account (the link works for 24 hours):\n\n${link}${SIGNATURE}`,
  }),
};
