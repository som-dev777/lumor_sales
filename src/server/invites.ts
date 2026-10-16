// Invite-only signup (F01). An Admin creates an invite and copies the link (D-002);
// the invited person opens it, sets name and password, and their account is created.
import { and, eq, gt, isNull } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { Role } from "@/lib/db/enums";
import { invite } from "@/lib/db/schema";
import { appUrl, generateToken, hashToken, normaliseEmail } from "@/lib/tokens";
import { createUserWithPassword, findUserByEmail, userAuditFields } from "./users";

export const INVITE_DAYS = 7;

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

/**
 * Creates an invite and returns the link to send. The caller must already have checked
 * `user.manage` and must pass the transaction the audit entry belongs to.
 */
export async function createInvite(
  tx: DbOrTx,
  input: { email: string; role: Role; invitedBy: string },
  now = new Date(),
) {
  const email = normaliseEmail(input.email);
  if (await findUserByEmail(tx, email)) {
    throw new InviteError(`${email} already has an account.`);
  }

  const token = generateToken();
  const [row] = await tx
    .insert(invite)
    .values({
      email,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      createdBy: input.invitedBy,
    })
    .returning();

  await writeAudit(tx, {
    userId: input.invitedBy,
    entityType: "Invite",
    recordId: row.id,
    recordName: email,
    action: "Created",
    after: { email, role: input.role, expiresAt: row.expiresAt },
  });

  return { invite: row, link: `${appUrl()}/register/${token}` };
}

/** Finds a usable invite for a link's token, or explains why it can't be used. */
export async function findUsableInvite(db: DbOrTx, token: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.tokenHash, hashToken(token)));
  if (!row) return { ok: false as const, reason: "This invite link isn't valid." };
  if (row.acceptedAt)
    return { ok: false as const, reason: "This invite has already been used. Log in instead." };
  if (row.revokedAt)
    return {
      ok: false as const,
      reason: "This invite was cancelled. Ask your admin for a new one.",
    };
  if (row.expiresAt <= now)
    return { ok: false as const, reason: "This invite has expired. Ask your admin for a new one." };
  return { ok: true as const, invite: row };
}

/** Uses an invite: creates the account and marks the invite as used, all or nothing. */
export async function acceptInvite(
  db: Db,
  input: { token: string; name: string; password: string },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const found = await findUsableInvite(tx, input.token, now);
    if (!found.ok) throw new InviteError(found.reason);
    const inv = found.invite;

    if (await findUserByEmail(tx, inv.email)) {
      throw new InviteError(`${inv.email} already has an account. Log in instead.`);
    }

    const created = await createUserWithPassword(tx, {
      name: input.name,
      email: inv.email,
      role: inv.role,
      password: input.password,
      createdBy: inv.createdBy,
    });

    // Marking it used only succeeds if nobody used it a moment earlier.
    const marked = await tx
      .update(invite)
      .set({ acceptedAt: now })
      .where(and(eq(invite.id, inv.id), isNull(invite.acceptedAt), gt(invite.expiresAt, now)))
      .returning({ id: invite.id });
    if (marked.length === 0)
      throw new InviteError("This invite has already been used. Log in instead.");

    await writeAudit(tx, {
      userId: created.id,
      entityType: "User",
      recordId: created.id,
      recordName: created.name,
      action: "Created",
      after: { ...userAuditFields(created), invitedBy: inv.createdBy },
    });

    return created;
  });
}
