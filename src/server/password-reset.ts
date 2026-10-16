// Password-reset links (F01, D-002). An Admin generates a link and sends it to the person.
// The link is checked and used by Better Auth's own resetPassword, so tokens are stored the
// way Better Auth expects (its "verification" table).
import type { Auth } from "@/lib/auth";
import { appUrl, generateToken } from "@/lib/tokens";

export const RESET_LINK_HOURS = 24;

const identifierFor = (token: string) => `reset-password:${token}`;

/** Creates a one-time reset link for a user. The caller checks permissions and audits. */
export async function createResetLink(auth: Auth, userId: string, now = new Date()) {
  const ctx = await auth.$context;
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + RESET_LINK_HOURS * 3_600_000);
  await ctx.internalAdapter.createVerificationValue({
    identifier: identifierFor(token),
    value: userId,
    expiresAt,
  });
  return { link: `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`, expiresAt };
}

/** Whose reset link is this? null if it doesn't exist or has expired. */
export async function userIdForResetToken(auth: Auth, token: string, now = new Date()) {
  const ctx = await auth.$context;
  const row = await ctx.internalAdapter.findVerificationValue(identifierFor(token));
  if (!row || row.expiresAt <= now) return null;
  return row.value;
}
