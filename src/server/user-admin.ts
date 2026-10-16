// Managing the team (F01, Settings → Users). Every function here checks `user.manage` with
// the shared permission check, and records the change with writeAudit() in the same
// transaction.
import { and, asc, count, eq, gt, isNull, notInArray } from "drizzle-orm";
import type { Auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { Role } from "@/lib/db/enums";
import { invite, person, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { createInvite } from "./invites";
import { createResetLink } from "./password-reset";

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

async function loadUser(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, id));
  if (!row) throw new UserAdminError("That user doesn't exist.");
  return row;
}

/** Active Admins other than `exceptId`. The app must never be left without one. */
async function otherActiveAdmins(tx: DbOrTx, exceptId: string) {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "Admin"), eq(user.active, true)));
  return rows.filter((r) => r.id !== exceptId).length;
}

export async function changeRole(db: Db, actor: Actor, targetId: string, role: Role) {
  assertCan(actor, "user.manage");
  if (targetId === actor.id) throw new UserAdminError("You can't change your own role.");

  return db.transaction(async (tx) => {
    const target = await loadUser(tx, targetId);
    if (target.role === role) return target;
    if (
      target.role === "Admin" &&
      target.active &&
      (await otherActiveAdmins(tx, target.id)) === 0
    ) {
      throw new UserAdminError("The app needs at least one active Admin.");
    }
    const [updated] = await tx.update(user).set({ role }).where(eq(user.id, targetId)).returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "User",
      recordId: target.id,
      recordName: target.name,
      action: "Role changed",
      before: { role: target.role },
      after: { role },
    });
    return updated;
  });
}

export async function setActive(db: Db, actor: Actor, targetId: string, active: boolean) {
  assertCan(actor, "user.manage");
  if (targetId === actor.id && !active) throw new UserAdminError("You can't deactivate yourself.");

  return db.transaction(async (tx) => {
    const target = await loadUser(tx, targetId);
    if (target.active === active) return target;
    if (!active && target.role === "Admin" && (await otherActiveAdmins(tx, target.id)) === 0) {
      throw new UserAdminError("The app needs at least one active Admin.");
    }
    const [updated] = await tx
      .update(user)
      .set({ active })
      .where(eq(user.id, targetId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "User",
      recordId: target.id,
      recordName: target.name,
      action: active ? "Reactivated" : "Deactivated",
      before: { active: target.active },
      after: { active },
    });
    return updated;
  });
}

export async function inviteUser(db: Db, actor: Actor, input: { email: string; role: Role }) {
  assertCan(actor, "user.manage");
  return db.transaction((tx) => createInvite(tx, { ...input, invitedBy: actor.id }));
}

export async function revokeInvite(db: Db, actor: Actor, inviteId: string, now = new Date()) {
  assertCan(actor, "user.manage");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(invite).where(eq(invite.id, inviteId));
    if (!row) throw new UserAdminError("That invite doesn't exist.");
    if (row.acceptedAt) throw new UserAdminError("That invite has already been used.");
    if (row.revokedAt) return row;
    const [updated] = await tx
      .update(invite)
      .set({ revokedAt: now })
      .where(eq(invite.id, inviteId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Invite",
      recordId: row.id,
      recordName: row.email,
      action: "Updated",
      before: { status: "Pending" },
      after: { status: "Cancelled" },
    });
    return updated;
  });
}

/** A one-time password-reset link for a team member (D-002: the Admin sends it). */
export async function generateResetLink(db: Db, auth: Auth, actor: Actor, targetId: string) {
  assertCan(actor, "user.manage");
  const target = await loadUser(db, targetId);
  const result = await createResetLink(auth, target.id);
  await writeAudit(db, {
    userId: actor.id,
    entityType: "User",
    recordId: target.id,
    recordName: target.name,
    action: "Updated",
    before: { resetLinkCreated: false },
    after: { resetLinkCreated: true },
  });
  return result;
}

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  openLeads: number;
};

/** Everyone, with how many open leads (not Paid or Lost) each one owns. */
export async function listTeam(db: DbOrTx): Promise<TeamMember[]> {
  const leads = await db
    .select({ ownerId: person.ownerId, n: count() })
    .from(person)
    .where(notInArray(person.stage, ["Paid", "Lost"]))
    .groupBy(person.ownerId);
  const byOwner = new Map(leads.map((l) => [l.ownerId, l.n]));

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.name));
  return rows.map((r) => ({ ...r, openLeads: byOwner.get(r.id) ?? 0 }));
}

/** Invites that haven't been used, cancelled or expired. */
export async function listPendingInvites(db: DbOrTx, now = new Date()) {
  return db
    .select({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    })
    .from(invite)
    .where(and(isNull(invite.acceptedAt), isNull(invite.revokedAt), gt(invite.expiresAt, now)))
    .orderBy(asc(invite.expiresAt));
}
