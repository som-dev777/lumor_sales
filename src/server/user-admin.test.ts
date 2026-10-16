import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "@/lib/auth";
import { auditLog, person, user } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { findUsableInvite } from "./invites";
import {
  changeRole,
  generateResetLink,
  inviteUser,
  listPendingInvites,
  listTeam,
  revokeInvite,
  setActive,
  UserAdminError,
} from "./user-admin";
import { createUserWithPassword } from "./users";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;
beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { nextJs: false });
});
afterEach(() => t.cleanup());

async function member(email: string, role: "Admin" | "User" = "User") {
  const u = await createUserWithPassword(t.db, {
    name: email.split("@")[0],
    email,
    role,
    password: "a-good-password",
    createdBy: null,
  });
  const actor: Actor = { id: u.id, role: u.role, active: u.active };
  return { ...u, actor };
}

const auditActions = async () =>
  (await t.db.select().from(auditLog).orderBy(auditLog.occurredAt)).map((e) => e.action);

describe("only Admins manage the team", () => {
  it("a User is refused every action", async () => {
    const rep = await member("rep@lumor.tech");
    const other = await member("other@lumor.tech");
    await expect(changeRole(t.db, rep.actor, other.id, "Admin")).rejects.toThrow(PermissionError);
    await expect(setActive(t.db, rep.actor, other.id, false)).rejects.toThrow(PermissionError);
    await expect(inviteUser(t.db, rep.actor, { email: "x@x.com", role: "User" })).rejects.toThrow(
      PermissionError,
    );
    await expect(generateResetLink(t.db, auth, rep.actor, other.id)).rejects.toThrow(
      PermissionError,
    );
  });
});

describe("change role", () => {
  it("promotes and demotes, with an audit entry each time", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const rep = await member("rep@lumor.tech");
    await changeRole(t.db, admin.actor, rep.id, "Admin");
    await changeRole(t.db, admin.actor, rep.id, "User");
    const [after] = await t.db.select().from(user).where(eq(user.id, rep.id));
    expect(after.role).toBe("User");
    expect(await auditActions()).toEqual(["Role changed", "Role changed"]);
  });

  it("an Admin can't change their own role", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    await member("b@lumor.tech", "Admin");
    await expect(changeRole(t.db, admin.actor, admin.id, "User")).rejects.toThrow(
      "You can't change your own role.",
    );
  });

  it("the last active Admin can't be demoted", async () => {
    // b was an Admin but has just been deactivated; b's screen hasn't caught up yet.
    const a = await member("a@lumor.tech", "Admin");
    const b = await member("b@lumor.tech", "Admin");
    await t.db.update(user).set({ active: false }).where(eq(user.id, b.id));
    await expect(changeRole(t.db, b.actor, a.id, "User")).rejects.toThrow(
      "The app needs at least one active Admin.",
    );
  });
});

describe("deactivate and reactivate", () => {
  it("deactivates and reactivates, with audit entries", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const rep = await member("rep@lumor.tech");
    await setActive(t.db, admin.actor, rep.id, false);
    await setActive(t.db, admin.actor, rep.id, true);
    expect(await auditActions()).toEqual(["Deactivated", "Reactivated"]);
  });

  it("you can't deactivate yourself", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    await expect(setActive(t.db, admin.actor, admin.id, false)).rejects.toThrow(
      "You can't deactivate yourself.",
    );
  });

  it("the last active Admin can't be deactivated", async () => {
    const a = await member("a@lumor.tech", "Admin");
    const b = await member("b@lumor.tech", "Admin");
    await t.db.update(user).set({ active: false }).where(eq(user.id, b.id));
    const err = await setActive(t.db, b.actor, a.id, false).catch((e) => e);
    expect(err).toBeInstanceOf(UserAdminError);
    expect(err.message).toBe("The app needs at least one active Admin.");
  });

  it("doing it twice changes nothing and logs nothing extra", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const rep = await member("rep@lumor.tech");
    await setActive(t.db, admin.actor, rep.id, false);
    await setActive(t.db, admin.actor, rep.id, false);
    expect(await auditActions()).toEqual(["Deactivated"]);
  });
});

describe("invites", () => {
  it("can be created and cancelled; a cancelled link stops working", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const { invite, link } = await inviteUser(t.db, admin.actor, {
      email: "partner@agency.com",
      role: "User",
    });
    expect(await listPendingInvites(t.db)).toHaveLength(1);

    await revokeInvite(t.db, admin.actor, invite.id);
    expect(await listPendingInvites(t.db)).toHaveLength(0);
    const token = link.split("/register/")[1];
    expect(await findUsableInvite(t.db, token)).toMatchObject({ ok: false });
    expect(await auditActions()).toEqual(["Created", "Updated"]);
  });
});

describe("reset links", () => {
  it("create a working link and an audit entry", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const rep = await member("rep@lumor.tech");
    const { link } = await generateResetLink(t.db, auth, admin.actor, rep.id);
    const token = decodeURIComponent(link.split("token=")[1]);
    await auth.api.resetPassword({ body: { token, newPassword: "brand-new-password" } });
    const res = await auth.api.signInEmail({
      body: { email: "rep@lumor.tech", password: "brand-new-password" },
    });
    expect(res.user.id).toBe(rep.id);
    expect(await auditActions()).toEqual(["Updated"]);
  });
});

describe("team list", () => {
  it("counts each person's open leads (not Paid or Lost)", async () => {
    const admin = await member("a@lumor.tech", "Admin");
    const rep = await member("rep@lumor.tech");
    const lead = (n: number, stage: "Prospect" | "Paid" | "Lost", ownerId: string) => ({
      fullName: `Lead ${n}`,
      linkedinUrl: `https://linkedin.com/in/lead-${n}`,
      linkedinUrlNormalised: `linkedin.com/in/lead-${n}`,
      ownerId,
      stage,
      lostReason: stage === "Lost" ? ("Other" as const) : null,
    });
    await t.db
      .insert(person)
      .values([
        lead(1, "Prospect", rep.id),
        lead(2, "Prospect", rep.id),
        lead(3, "Paid", rep.id),
        lead(4, "Lost", rep.id),
      ]);
    const team = await listTeam(t.db);
    expect(team.find((m) => m.id === rep.id)?.openLeads).toBe(2);
    expect(team.find((m) => m.id === admin.id)?.openLeads).toBe(0);
  });
});
