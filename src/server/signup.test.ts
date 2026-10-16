import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "@/lib/auth";
import { auditLog } from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { SignupError, signUpWithCompanyEmail } from "./signup";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;
beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { nextJs: false });
});
afterEach(() => t.cleanup());

const PASSWORD = "a-good-password";
const signUp = (email: string, name = "Asha Rep") =>
  signUpWithCompanyEmail(t.db, { name, email, password: PASSWORD });

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
