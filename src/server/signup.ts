// Self sign-up for @lumor.tech emails (D-012). New accounts are Users; Admins come from
// the seed script (D-013) or from an Admin changing someone's role.
import { writeAudit } from "@/lib/audit";
import { isDefaultAdminEmail, isSignupDomain, SIGNUP_EMAIL_DOMAIN } from "@/lib/auth-rules";
import type { Db } from "@/lib/db/client";
import { normaliseEmail } from "@/lib/tokens";
import { createVerification } from "./email-verification";
import { createUserWithPassword, findUserByEmail, userAuditFields } from "./users";

export class SignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupError";
  }
}

export async function signUpWithCompanyEmail(
  db: Db,
  input: { name: string; email: string; password: string },
  { requireConfirmation = false }: { requireConfirmation?: boolean } = {},
): Promise<{
  user: Awaited<ReturnType<typeof createUserWithPassword>>;
  confirmLink: string | null;
}> {
  const email = normaliseEmail(input.email);

  if (!isSignupDomain(email)) {
    throw new SignupError(
      `Sign-up is only for @${SIGNUP_EMAIL_DOMAIN} emails. For any other email, ask an Admin for an invite.`,
    );
  }
  if (isDefaultAdminEmail(email)) {
    throw new SignupError(
      "This Admin account is already set up. Log in with the default password, or ask another Admin for a reset link.",
    );
  }

  return db.transaction(async (tx) => {
    if (await findUserByEmail(tx, email)) {
      throw new SignupError(`${email} already has an account. Log in instead.`);
    }
    const created = await createUserWithPassword(tx, {
      name: input.name,
      email,
      role: "User",
      password: input.password,
      createdBy: null,
    });
    await writeAudit(tx, {
      userId: created.id,
      entityType: "User",
      recordId: created.id,
      recordName: created.name,
      action: "Created",
      after: { ...userAuditFields(created), source: "self sign-up" },
    });
    // With email set up, the account waits for its owner to open the emailed link (D-023).
    const confirmLink = requireConfirmation ? await createVerification(tx, created.id) : null;
    return { user: created, confirmLink };
  });
}
