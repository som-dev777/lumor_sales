// Password-reset links (F01, D-002). An Admin generates a link and sends it to the person.
// The link is checked and used by Better Auth's own resetPassword, so tokens are stored the
// way Better Auth expects (its "verification" table).
import { and, eq, like } from "drizzle-orm";
import type { Auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { loginAttempt, user, verification } from "@/lib/db/schema";
import { appUrl, generateToken, normaliseEmail } from "@/lib/tokens";

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

/**
 * After a password is reset or changed (F01, 2026-10-30 fix): the forced change is cleared, the
 * email counts as confirmed (they proved they own the account), any pending confirmation link is
 * dropped, and earlier wrong passwords stop counting towards the 15-minute pause. Audited.
 */
export async function afterPasswordSet(db: Db, userId: string, actorId: string, now = new Date()) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(user).where(eq(user.id, userId));
    if (!before) return;
    await tx
      .update(user)
      .set({ mustChangePassword: false, emailVerified: true })
      .where(eq(user.id, userId));
    await tx
      .delete(verification)
      .where(and(eq(verification.value, userId), like(verification.identifier, "verify-email:%")));
    await tx
      .insert(loginAttempt)
      .values({ email: normaliseEmail(before.email), succeeded: true, occurredAt: now });
    await writeAudit(tx, {
      userId: actorId,
      entityType: "User",
      recordId: userId,
      recordName: before.name,
      action: "Updated",
      // The password itself is never logged, only the fact that it changed.
      before: {
        passwordChanged: false,
        mustChangePassword: before.mustChangePassword,
        emailVerified: before.emailVerified,
      },
      after: { passwordChanged: true, mustChangePassword: false, emailVerified: true },
    });
  });
}
