// Sending email through Resend (D-023). Only used when RESEND_API_KEY and EMAIL_FROM are
// set; otherwise the app shows links to copy instead (D-002).

export type Email = { to: string; subject: string; text: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

/** Sends one email. Returns false (and logs why, without secrets) if it couldn't be sent. */
export async function sendEmail(email: Email, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`Email to ${email.to} failed: Resend answered ${res.status}.`);
    return res.ok;
  } catch (e) {
    console.error(`Email to ${email.to} failed:`, e instanceof Error ? e.message : e);
    return false;
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
