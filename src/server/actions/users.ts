"use server";

// Settings → Users Server Actions (F01). Each one: requireUser() → the shared permission
// check (inside user-admin.ts) → the change + writeAudit() → refresh the page.
import { refresh } from "next/cache";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import type { Role } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { inviteSchema, roleSchema, userIdSchema, type InviteInput } from "@/lib/validation/users";
import { InviteError } from "../invites";
import {
  changeRole as changeRoleFor,
  generateResetLink,
  inviteUser,
  revokeInvite,
  setActive,
  UserAdminError,
} from "../user-admin";

/** Expected refusals become a message for the person; anything else is a real error. */
async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof PermissionError || e instanceof UserAdminError || e instanceof InviteError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

export async function invite(input: InviteInput): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  return run(async () => {
    const { link } = await inviteUser(getDb(), viewer, parsed.data);
    refresh();
    return { ok: true, link, message: `Invite created for ${parsed.data.email}.` };
  });
}

export async function cancelInvite(inviteId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!userIdSchema.safeParse(inviteId).success) return { ok: false, error: "Unknown invite." };
  return run(async () => {
    await revokeInvite(getDb(), viewer, inviteId);
    refresh();
    return { ok: true, message: "Invite cancelled." };
  });
}

export async function changeRole(userId: string, role: Role): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!userIdSchema.safeParse(userId).success || !roleSchema.safeParse(role).success) {
    return { ok: false, error: "Unknown user or role." };
  }
  return run(async () => {
    const updated = await changeRoleFor(getDb(), viewer, userId, role);
    refresh();
    return {
      ok: true,
      message: `${updated.name} is now ${role === "Admin" ? "an Admin" : "a User"}.`,
    };
  });
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  return toggleActive(userId, false);
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  return toggleActive(userId, true);
}

async function toggleActive(userId: string, active: boolean): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!userIdSchema.safeParse(userId).success) return { ok: false, error: "Unknown user." };
  return run(async () => {
    const updated = await setActive(getDb(), viewer, userId, active);
    refresh();
    return { ok: true, message: `${updated.name} ${active ? "reactivated" : "deactivated"}.` };
  });
}

export async function createResetLink(userId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!userIdSchema.safeParse(userId).success) return { ok: false, error: "Unknown user." };
  return run(async () => {
    const { link } = await generateResetLink(getDb(), getAuth(), viewer, userId);
    return { ok: true, link, message: "Reset link created. It works once, for 24 hours." };
  });
}
