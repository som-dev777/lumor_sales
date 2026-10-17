"use server";

// Login, logout, registration and password Server Actions (F01).
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { writeAudit } from "@/lib/audit";
import { ACCESS_DISABLED_MESSAGE, getAuth } from "@/lib/auth";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "@/lib/auth-rules";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  signupSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@/lib/validation/auth";
import { emailConfigured, emails, sendEmail } from "../email";
import { confirmEmail, renewIfExpired, VerificationError } from "../email-verification";
import { acceptInvite, InviteError } from "../invites";
import { LOGIN_PAUSED_MESSAGE, loginPausedUntil, recordLoginAttempt } from "../login-limit";
import { userIdForResetToken } from "../password-reset";
import { SignupError, signUpWithCompanyEmail } from "../signup";
import { findUserByEmail } from "../users";

const invalid = (issues: Parameters<typeof fieldErrorsFrom>[0]): ActionResult => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: fieldErrorsFrom(issues),
});

/** Only follow `next` if it's a page inside this app. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(input: LoginInput, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const db = getDb();
  const { email } = parsed.data;

  // 5 wrong passwords in 15 minutes pause this email for 15 minutes (D-023).
  if (await loginPausedUntil(db, email)) return { ok: false, error: LOGIN_PAUSED_MESSAGE };

  try {
    await getAuth().api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    const message = errorMessage(e, "");
    // The password was right; the account just can't log in yet (or any more).
    if (message === ACCESS_DISABLED_MESSAGE) return { ok: false, error: message };
    if (message === EMAIL_NOT_CONFIRMED_MESSAGE) {
      const pending = await findUserByEmail(db, email);
      const fresh = pending && (await renewIfExpired(db, pending.id));
      if (fresh) await sendEmail(emails.verify(pending.email, fresh));
      return { ok: false, error: message };
    }
    await recordLoginAttempt(db, email, false);
    return { ok: false, error: "Wrong email or password." };
  }

  await recordLoginAttempt(db, email, true);
  const signedIn = await findUserByEmail(db, email);
  redirect(signedIn?.mustChangePassword ? "/change-password" : safeNext(next));
}

export async function logout(): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // Already signed out: nothing to do.
  }
  redirect("/login");
}

export async function signUp(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  // With email set up, new accounts confirm their address first (D-023).
  let confirmLink: string | null;
  try {
    ({ confirmLink } = await signUpWithCompanyEmail(getDb(), parsed.data, {
      requireConfirmation: emailConfigured(),
    }));
  } catch (e) {
    if (e instanceof SignupError) return { ok: false, error: e.message };
    throw e;
  }
  if (confirmLink) {
    if (await sendEmail(emails.verify(parsed.data.email.trim().toLowerCase(), confirmLink))) {
      redirect("/login?confirm=1");
    }
    // The email couldn't be sent: confirm at once rather than lock the person out.
    await confirmEmail(getDb(), new URL(confirmLink).searchParams.get("token")!);
  }

  // Signed straight in after creating the account.
  try {
    await getAuth().api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch {
    redirect("/login?registered=1");
  }
  redirect("/");
}

export async function register(input: RegisterInput): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  try {
    await acceptInvite(getDb(), parsed.data);
  } catch (e) {
    if (e instanceof InviteError) return { ok: false, error: e.message };
    throw e;
  }
  redirect("/login?registered=1");
}

export async function confirmMyEmail(token: string): Promise<ActionResult> {
  if (typeof token !== "string" || !token || token.length > 200) {
    return { ok: false, error: "This link isn't valid." };
  }
  try {
    await confirmEmail(getDb(), token);
  } catch (e) {
    if (e instanceof VerificationError) return { ok: false, error: e.message };
    throw e;
  }
  redirect("/login?confirmed=1");
}

export async function resetPassword(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { token, password } = parsed.data;

  const auth = getAuth();
  const userId = await userIdForResetToken(auth, token);
  const expired = "This reset link is invalid or has expired. Ask your admin for a new one.";
  if (!userId) return { ok: false, error: expired };

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password } });
  } catch {
    return { ok: false, error: expired };
  }

  await recordPasswordChange(userId, userId);
  redirect("/login?reset=1");
}

export async function changePassword(input: ChangePasswordInput): Promise<ActionResult> {
  const viewer = await requireUser({ allowPendingPasswordChange: true });
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  try {
    await getAuth().api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.password,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    return {
      ok: false,
      error: "Your current password isn't right.",
      fieldErrors: { currentPassword: "Your current password isn't right." },
    };
  }

  await recordPasswordChange(viewer.id, viewer.id);
  redirect("/");
}

/** Clears a pending forced change (D-006) and records that the password changed. */
async function recordPasswordChange(userId: string, actorId: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(user).where(eq(user.id, userId));
    if (!before) return;
    await tx.update(user).set({ mustChangePassword: false }).where(eq(user.id, userId));
    await writeAudit(tx, {
      userId: actorId,
      entityType: "User",
      recordId: userId,
      recordName: before.name,
      action: "Updated",
      // The password itself is never logged, only the fact that it changed.
      before: { passwordChanged: false, mustChangePassword: before.mustChangePassword },
      after: { passwordChanged: true, mustChangePassword: false },
    });
  });
}
