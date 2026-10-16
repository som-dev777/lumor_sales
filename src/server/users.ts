// Creating users with a password (F01). Used by invite registration and the seed script.
// Users are never created through Better Auth itself (its sign-up is switched off).
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import type { Role } from "@/lib/db/enums";
import { account, user } from "@/lib/db/schema";
import { normaliseEmail } from "@/lib/tokens";

export type NewUser = {
  name: string;
  email: string;
  role: Role;
  password: string;
  createdBy: string | null;
  mustChangePassword?: boolean;
};

/** Inserts the user and their password login. Run it inside a transaction. */
export async function createUserWithPassword(tx: DbOrTx, input: NewUser) {
  const [created] = await tx
    .insert(user)
    .values({
      name: input.name.trim(),
      email: normaliseEmail(input.email),
      role: input.role,
      active: true,
      mustChangePassword: input.mustChangePassword ?? false,
      createdBy: input.createdBy,
    })
    .returning();

  await tx.insert(account).values({
    userId: created.id,
    // Better Auth's names for an email + password login.
    providerId: "credential",
    accountId: created.id,
    password: await hashPassword(input.password),
  });

  return created;
}

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.email, normaliseEmail(email)));
  return row ?? null;
}

/** The fields shown in the audit log when a user is created. */
export function userAuditFields(u: typeof user.$inferSelect) {
  return { name: u.name, email: u.email, role: u.role, active: u.active };
}
