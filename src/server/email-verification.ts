// Sign-up email confirmation (D-023). Only used when email is set up: a new self-signed-up
// account can't log in until its owner opens the link sent to that address.
import { and, eq, gt, like } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { user, verification } from "@/lib/db/schema";
import { appUrl, generateToken, hashToken } from "@/lib/tokens";

export const VERIFY_LINK_HOURS = 24;
const PREFIX = "verify-email:";

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

/** Creates a confirmation link for a user. Only a hash of the secret is stored. */
export async function createVerification(tx: DbOrTx, userId: string, now = new Date()) {
  const token = generateToken();
  await tx.insert(verification).values({
    identifier: PREFIX + hashToken(token),
    value: userId,
    expiresAt: new Date(now.getTime() + VERIFY_LINK_HOURS * 3_600_000),
  });
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

const pendingRows = (db: DbOrTx, userId: string) =>
  db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, `${PREFIX}%`)));

/** Is this user still waiting to confirm their email? */
export async function awaitingConfirmation(db: DbOrTx, userId: string) {
  return (await pendingRows(db, userId)).length > 0;
}

/** A fresh link if every link this user has is expired; null if a live one exists. */
export async function renewIfExpired(db: DbOrTx, userId: string, now = new Date()) {
  const rows = await pendingRows(db, userId);
  if (rows.length === 0 || rows.some((r) => r.expiresAt > now)) return null;
  return createVerification(db, userId, now);
}

/** Confirms the email behind a link. Audited as a change to the user. */
export async function confirmEmail(db: Db, token: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.identifier, PREFIX + hashToken(token)),
          gt(verification.expiresAt, now),
        ),
      );
    if (!row) {
      throw new VerificationError(
        "This link is invalid or has expired. Log in to get a new one sent to you.",
      );
    }
    const [before] = await tx.select().from(user).where(eq(user.id, row.value));
    if (!before) throw new VerificationError("This account no longer exists.");
    await tx
      .delete(verification)
      .where(and(eq(verification.value, before.id), like(verification.identifier, `${PREFIX}%`)));
    const [after] = await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, before.id))
      .returning();
    await writeAudit(tx, {
      userId: before.id,
      entityType: "User",
      recordId: before.id,
      recordName: before.name,
      action: "Updated",
      before: { emailVerified: before.emailVerified },
      after: { emailVerified: after.emailVerified },
    });
    return after;
  });
}
