import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCESS_DISABLED_MESSAGE, createAuth, type Auth } from "@/lib/auth";
import { auditLog, invite, user } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { acceptInvite, createInvite, findUsableInvite, InviteError } from "./invites";
import { createResetLink, userIdForResetToken } from "./password-reset";
import { createUserWithPassword } from "./users";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { nextJs: false });
});
afterEach(() => t.cleanup());

const PASSWORD = "correct-horse-battery";

async function makeAdmin() {
  return createUserWithPassword(t.db, {
    name: "Somnath",
    email: "Admin@Example.com",
    role: "Admin",
    password: PASSWORD,
    createdBy: null,
  });
}

function signIn(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password } });
}

function tokenFrom(link: string) {
  return decodeURIComponent(link.split("/register/")[1] ?? link.split("token=")[1]);
}

describe("login", () => {
  it("works with the right password (email is not case-sensitive)", async () => {
    await makeAdmin();
    const res = await signIn("admin@example.com", PASSWORD);
    expect(res.user.email).toBe("admin@example.com");
  });

  it("refuses a wrong password", async () => {
    await makeAdmin();
    await expect(signIn("admin@example.com", "wrong-password-123")).rejects.toThrow();
  });

  it("refuses a deactivated user with 'Access disabled, contact your admin'", async () => {
    const admin = await makeAdmin();
    await t.db.update(user).set({ active: false }).where(eq(user.id, admin.id));
    await expect(signIn("admin@example.com", PASSWORD)).rejects.toThrow(ACCESS_DISABLED_MESSAGE);
  });

  it("Better Auth's own sign-up is switched off (invite-only)", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "x@example.com", password: PASSWORD, name: "X" } }),
    ).rejects.toThrow();
    expect(await t.db.select().from(user)).toHaveLength(0);
  });
});

describe("invites", () => {
  it("an invite link creates the account once, with the invite's role", async () => {
    const admin = await makeAdmin();
    const { link } = await createInvite(t.db, {
      email: "Rep@Example.com",
      role: "User",
      invitedBy: admin.id,
    });
    const token = tokenFrom(link);
    expect(link).toMatch(/\/register\/.+/);

    const rep = await acceptInvite(t.db, { token, name: "Asha", password: PASSWORD });
    expect(rep).toMatchObject({ email: "rep@example.com", role: "User", createdBy: admin.id });
    expect((await signIn("rep@example.com", PASSWORD)).user.id).toBe(rep.id);

    await expect(acceptInvite(t.db, { token, name: "Again", password: PASSWORD })).rejects.toThrow(
      /already been used/,
    );
  });

  it("only a hash of the secret is stored", async () => {
    const admin = await makeAdmin();
    const { link } = await createInvite(t.db, {
      email: "a@example.com",
      role: "User",
      invitedBy: admin.id,
    });
    const [row] = await t.db.select().from(invite);
    expect(row.tokenHash).not.toContain(tokenFrom(link));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires after 7 days", async () => {
    const admin = await makeAdmin();
    const sent = new Date("2026-10-16T10:00:00Z");
    const { link } = await createInvite(
      t.db,
      { email: "a@example.com", role: "User", invitedBy: admin.id },
      sent,
    );
    const later = new Date(sent.getTime() + 7 * 86_400_000 + 1);
    const found = await findUsableInvite(t.db, tokenFrom(link), later);
    expect(found).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
    await expect(
      acceptInvite(t.db, { token: tokenFrom(link), name: "A", password: PASSWORD }, later),
    ).rejects.toThrow(/expired/);
  });

  it("can't invite an email that already has an account", async () => {
    const admin = await makeAdmin();
    await expect(
      createInvite(t.db, { email: "ADMIN@example.com", role: "User", invitedBy: admin.id }),
    ).rejects.toThrow(InviteError);
  });

  it("a made-up link is refused", async () => {
    await expect(
      acceptInvite(t.db, { token: "not-a-real-token", name: "A", password: PASSWORD }),
    ).rejects.toThrow(/isn't valid/);
  });

  it("writes audit entries for the invite and the new account", async () => {
    const admin = await makeAdmin();
    const { link } = await createInvite(t.db, {
      email: "a@example.com",
      role: "Admin",
      invitedBy: admin.id,
    });
    const rep = await acceptInvite(t.db, {
      token: tokenFrom(link),
      name: "Asha",
      password: PASSWORD,
    });

    const entries = await t.db.select().from(auditLog).orderBy(auditLog.occurredAt);
    expect(entries.map((e) => [e.entityType, e.action, e.userId])).toEqual([
      ["Invite", "Created", admin.id],
      ["User", "Created", rep.id],
    ]);
    expect(entries[1].changes).toMatchObject({
      email: { before: null, after: "a@example.com" },
      role: { before: null, after: "Admin" },
      invitedBy: { before: null, after: admin.id },
    });
    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
  });
});

describe("password reset links", () => {
  it("set a new password once; the old one stops working", async () => {
    const admin = await makeAdmin();
    const { link } = await createResetLink(auth, admin.id);
    const token = tokenFrom(link);
    expect(await userIdForResetToken(auth, token)).toBe(admin.id);

    await auth.api.resetPassword({ body: { token, newPassword: "a-brand-new-password" } });

    await expect(signIn("admin@example.com", PASSWORD)).rejects.toThrow();
    expect((await signIn("admin@example.com", "a-brand-new-password")).user.id).toBe(admin.id);
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "yet-another-password" } }),
    ).rejects.toThrow();
  });

  it("refuse passwords shorter than 10 characters", async () => {
    const admin = await makeAdmin();
    const { link } = await createResetLink(auth, admin.id);
    await expect(
      auth.api.resetPassword({ body: { token: tokenFrom(link), newPassword: "short" } }),
    ).rejects.toThrow();
  });
});
