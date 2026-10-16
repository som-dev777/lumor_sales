// `npm run seed:admin`: creates the first Admin (PRD: Somnath) with a one-time password.
// The Admin must choose their own password at first login (D-006).
//
// `npm run seed:admin -- --reset`: if the Admin is locked out, gives them a new one-time
// password (and logs them out everywhere).
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "../src/lib/audit";
import { createDb } from "../src/lib/db/client";
import { account, session, user } from "../src/lib/db/schema";
import { createUserWithPassword, findUserByEmail, userAuditFields } from "../src/server/users";
import { loadEnv, requireEnv } from "./_env";

const FIRST_ADMIN = { name: "Somnath Chakraborty", email: "s.chakraborty1409@gmail.com" };

/** 16 easy-to-type characters (no 0/O or 1/l look-alikes). */
function oneTimePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const reset = process.argv.includes("--reset");
  const password = oneTimePassword();
  const existing = await findUserByEmail(db, FIRST_ADMIN.email);

  if (existing && !reset) {
    console.log(`${FIRST_ADMIN.email} already exists. Nothing changed.`);
    console.log("Locked out? Run: npm run seed:admin -- --reset");
    client.close();
    return;
  }

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(account)
        .set({ password: await hashPassword(password) })
        .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
      await tx
        .update(user)
        .set({ mustChangePassword: true, active: true, role: "Admin" })
        .where(eq(user.id, existing.id));
      await tx.delete(session).where(eq(session.userId, existing.id));
      await writeAudit(tx, {
        userId: null,
        entityType: "User",
        recordId: existing.id,
        recordName: existing.name,
        action: "Updated",
        before: {
          passwordChanged: false,
          mustChangePassword: existing.mustChangePassword,
          active: existing.active,
          role: existing.role,
        },
        after: { passwordChanged: true, mustChangePassword: true, active: true, role: "Admin" },
      });
      return;
    }

    const created = await createUserWithPassword(tx, {
      ...FIRST_ADMIN,
      role: "Admin",
      password,
      createdBy: null,
      mustChangePassword: true,
    });
    await writeAudit(tx, {
      userId: null,
      entityType: "User",
      recordId: created.id,
      recordName: created.name,
      action: "Created",
      after: { ...userAuditFields(created), source: "seed script" },
    });
  });

  console.log("");
  console.log(existing ? "Admin password reset." : "First Admin created.");
  console.log(`  Email:              ${FIRST_ADMIN.email}`);
  console.log(`  One-time password:  ${password}`);
  console.log("");
  console.log(
    "Log in at http://localhost:3000/login. You'll be asked to choose your own password.",
  );
  console.log("This password is shown only once and isn't saved anywhere.");
  client.close();
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
