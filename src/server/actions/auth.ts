"use server";

// Login, logout, registration and password Server Actions (F01).
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { writeAudit } from "@/lib/audit";
import { ACCESS_DISABLED_MESSAGE, getAuth } from "@/lib/auth";
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
import { acceptInvite, InviteError } from "../invites";
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

  try {
    await getAuth().api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    const message = errorMessage(e, "");
    return {
      ok: false,
      error: message === ACCESS_DISABLED_MESSAGE ? message : "Wrong email or password.",
    };
  }

  const signedIn = await findUserByEmail(getDb(), parsed.data.email);
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

  try {
    await signUpWithCompanyEmail(getDb(), parsed.data);
  } catch (e) {
    if (e instanceof SignupError) return { ok: false, error: e.message };
    throw e;
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
