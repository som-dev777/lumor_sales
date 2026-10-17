// Better Auth setup (F01, D-010).
//
// Better Auth checks passwords and manages login sessions. Its own web endpoints are NOT
// mounted (there is no /api/auth route): every login action goes through our Server
// Actions, which call `auth.api.*` directly. Creating users, changing roles and
// deactivating happen in our own code with the permission check and writeAudit().
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { awaitingConfirmation } from "@/server/email-verification";
import {
  ACCESS_DISABLED_MESSAGE,
  EMAIL_NOT_CONFIRMED_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./auth-rules";
import { getDb, type Db } from "./db/client";
import { account, session, user, verification } from "./db/schema";

export { ACCESS_DISABLED_MESSAGE };

/**
 * `nextJs: false` is for automated tests, which run outside Next.js and so can't set
 * cookies through Next.
 */
export function createAuth(db: Db, { nextJs = true }: { nextJs?: boolean } = {}) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      // Invite-only (PRD): Better Auth may never create a user. See also the hook below.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // A password reset logs the person out everywhere else.
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // extended at most once a day
    },
    advanced: {
      database: { generateId: "uuid" },
    },
    databaseHooks: {
      user: {
        create: {
          // Backstop for invite-only signup: users are only created by our own code
          // (invite registration and the seed script), never through Better Auth.
          before: async () => {
            throw new APIError("FORBIDDEN", { message: "Sign-up needs an invite from an Admin." });
          },
        },
      },
      session: {
        create: {
          // A deactivated user can't log in, nor one who hasn't confirmed their email yet.
          before: async (newSession) => {
            const [row] = await db
              .select({ active: user.active, emailVerified: user.emailVerified })
              .from(user)
              .where(eq(user.id, newSession.userId));
            if (!row?.active) {
              throw new APIError("FORBIDDEN", { message: ACCESS_DISABLED_MESSAGE });
            }
            if (!row.emailVerified && (await awaitingConfirmation(db, newSession.userId))) {
              throw new APIError("FORBIDDEN", { message: EMAIL_NOT_CONFIRMED_MESSAGE });
            }
          },
        },
      },
    },
    // Must be the last plugin: lets Server Actions set the login cookie.
    plugins: nextJs ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { lumorAuth?: Auth };

/** The app's Better Auth instance. */
export function getAuth(): Auth {
  globalForAuth.lumorAuth ??= createAuth(getDb());
  return globalForAuth.lumorAuth;
}
