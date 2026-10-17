import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "@/lib/auth";
import { auditLog } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "@/lib/auth-rules";
import { confirmEmail, renewIfExpired, VerificationError } from "./email-verification";
import { SignupError, signUpWithCompanyEmail } from "./signup";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;
beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { nextJs: false });
});
afterEach(() => t.cleanup());

const PASSWORD = "a-good-password";
const signUp = async (email: string, name = "Asha Rep") =>
  (await signUpWithCompanyEmail(t.db, { name, email, password: PASSWORD })).user;

describe("self sign-up (D-012)", () => {
  it("an @lumor.tech email gets a User account that can log in", async () => {
    const created = await signUp("Asha@Lumor.Tech");
    expect(created).toMatchObject({ email: "asha@lumor.tech", role: "User", active: true });
    const res = await auth.api.signInEmail({
      body: { email: "asha@lumor.tech", password: PASSWORD },
    });
    expect(res.user.id).toBe(created.id);
  });

  it("refuses other domains, including look-alikes", async () => {
    for (const email of [
      "asha@gmail.com",
      "asha@lumor.tech.evil.com",
      "asha@notlumor.tech",
      "asha@sub.lumor.tech",
    ]) {
      await expect(signUp(email)).rejects.toThrow(SignupError);
    }
  });

  it("the default Admin emails can't be claimed through sign-up", async () => {
    await expect(signUp("somnath@lumor.tech")).rejects.toThrow(/already set up/);
    await expect(signUp("PRINCE@lumor.tech")).rejects.toThrow(/already set up/);
  });

  it("an email can only sign up once", async () => {
    await signUp("asha@lumor.tech");
    await expect(signUp("asha@lumor.tech")).rejects.toThrow(/already has an account/);
  });

  it("writes an audit entry, without the password", async () => {
    const created = await signUp("asha@lumor.tech");
    const [entry] = await t.db.select().from(auditLog);
    expect(entry).toMatchObject({ userId: created.id, entityType: "User", action: "Created" });
    expect(entry.changes).toMatchObject({ source: { before: null, after: "self sign-up" } });
    expect(JSON.stringify(entry)).not.toContain(PASSWORD);
  });
});

describe("sign-up email confirmation (D-023)", () => {
  const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;
  const logIn = () =>
    auth.api.signInEmail({ body: { email: "asha@lumor.tech", password: PASSWORD } });

  it("with email set up, the account can't log in until the link is opened", async () => {
    const { user, confirmLink } = await signUpWithCompanyEmail(
      t.db,
      { name: "Asha", email: "asha@lumor.tech", password: PASSWORD },
      { requireConfirmation: true },
    );
    expect(confirmLink).toMatch(/\/verify-email\?token=/);
    await expect(logIn()).rejects.toThrow(EMAIL_NOT_CONFIRMED_MESSAGE);

    const confirmed = await confirmEmail(t.db, tokenOf(confirmLink!));
    expect(confirmed.emailVerified).toBe(true);
    expect((await logIn()).user.id).toBe(user.id);
    // Used once only.
    await expect(confirmEmail(t.db, tokenOf(confirmLink!))).rejects.toThrow(VerificationError);
    const entries = await t.db.select().from(auditLog);
    expect(entries.at(-1)!.changes).toMatchObject({
      emailVerified: { before: false, after: true },
    });
  });

  it("an expired link doesn't work; logging in then gets a fresh one", async () => {
    const { user, confirmLink } = await signUpWithCompanyEmail(
      t.db,
      { name: "Asha", email: "asha@lumor.tech", password: PASSWORD },
      { requireConfirmation: true },
    );
    const later = new Date(Date.now() + 25 * 3_600_000);
    await expect(confirmEmail(t.db, tokenOf(confirmLink!), later)).rejects.toThrow(/expired/);
    expect(await renewIfExpired(t.db, user.id)).toBeNull(); // the first link is still live now
    const fresh = await renewIfExpired(t.db, user.id, later);
    expect(fresh).toMatch(/\/verify-email\?token=/);
    await confirmEmail(t.db, tokenOf(fresh!), later);
  });

  it("without email set up, sign-ups can log in straight away", async () => {
    const { confirmLink } = await signUpWithCompanyEmail(t.db, {
      name: "Asha",
      email: "asha@lumor.tech",
      password: PASSWORD,
    });
    expect(confirmLink).toBeNull();
    await logIn();
  });
});
