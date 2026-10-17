// Pausing logins after repeated wrong passwords (D-023): 5 wrong passwords for one email
// within 15 minutes pause logging in to that email for 15 minutes from the last one.
import { and, desc, eq, gt, lt } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { loginAttempt } from "@/lib/db/schema";
import { normaliseEmail } from "@/lib/tokens";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_PAUSED_MESSAGE =
  "Too many wrong passwords. Logging in to this account is paused for 15 minutes.";

/** The time logins resume for this email, or null if it isn't paused. */
export async function loginPausedUntil(db: DbOrTx, email: string, now = new Date()) {
  const recent = await db
    .select({ succeeded: loginAttempt.succeeded, at: loginAttempt.occurredAt })
    .from(loginAttempt)
    .where(
      and(
        eq(loginAttempt.email, normaliseEmail(email)),
        gt(loginAttempt.occurredAt, new Date(now.getTime() - 2 * WINDOW_MS)),
      ),
    )
    .orderBy(desc(loginAttempt.occurredAt));
  // Only failures since the last successful login count.
  const failures: Date[] = [];
  for (const a of recent) {
    if (a.succeeded) break;
    failures.push(a.at);
  }
  if (failures.length < MAX_FAILURES) return null;
  const last = failures[0];
  const inWindow = failures.filter((at) => at.getTime() > last.getTime() - WINDOW_MS).length;
  const until = new Date(last.getTime() + WINDOW_MS);
  return inWindow >= MAX_FAILURES && until > now ? until : null;
}

export async function recordLoginAttempt(
  db: DbOrTx,
  email: string,
  succeeded: boolean,
  now = new Date(),
) {
  await db
    .insert(loginAttempt)
    .values({ email: normaliseEmail(email), succeeded, occurredAt: now });
  // Keep the table small: attempts older than a day are no longer needed.
  await db
    .delete(loginAttempt)
    .where(lt(loginAttempt.occurredAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}
