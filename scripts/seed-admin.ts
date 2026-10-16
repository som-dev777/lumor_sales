// `npm run seed:admin`: creates the default Admins (D-013): somnath@, arijeet@ and
// prince@lumor.tech, with the password in SEED_ADMIN_PASSWORD (.env.local). Safe to run
// again: existing accounts are left alone.
//
// `npm run seed:admin -- --reset`: also sets each existing default Admin back to that
// password, makes them active Admins again, and logs them out everywhere.
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "../src/lib/audit";
import { DEFAULT_ADMIN_EMAILS, PASSWORD_MIN_LENGTH } from "../src/lib/auth-rules";
import { createDb } from "../src/lib/db/client";
import { account, session, user } from "../src/lib/db/schema";
import { createUserWithPassword, findUserByEmail, userAuditFields } from "../src/server/users";
import { loadEnv, requireEnv } from "./_env";

/** "somnath@lumor.tech" → "Somnath" (they can change it later). */
const nameFromEmail = (email: string) =>
  email.charAt(0).toUpperCase() + email.slice(1, email.indexOf("@"));

async function main() {
  loadEnv();
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  if (password.length < PASSWORD_MIN_LENGTH) {
    console.error(`SEED_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    process.exit(1);
  }
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const reset = process.argv.includes("--reset");

  for (const email of DEFAULT_ADMIN_EMAILS) {
    const existing = await findUserByEmail(db, email);

    if (existing && !reset) {
      console.log(`  ${email.padEnd(22)} already exists, left alone`);
      continue;
    }

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(account)
          .set({ password: await hashPassword(password) })
          .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
        await tx
          .update(user)
          .set({ role: "Admin", active: true, mustChangePassword: false })
          .where(eq(user.id, existing.id));
        await tx.delete(session).where(eq(session.userId, existing.id));
        await writeAudit(tx, {
          userId: null,
          entityType: "User",
          recordId: existing.id,
          recordName: existing.name,
          action: "Updated",
          before: { passwordChanged: false, role: existing.role, active: existing.active },
          after: { passwordChanged: true, role: "Admin", active: true },
        });
        return;
      }

      const created = await createUserWithPassword(tx, {
        name: nameFromEmail(email),
        email,
        role: "Admin",
        password,
        createdBy: null,
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
    console.log(`  ${email.padEnd(22)} ${existing ? "password reset" : "created as Admin"}`);
  }

  console.log(
    "\nDefault Admins can log in at http://localhost:3000/login with SEED_ADMIN_PASSWORD.",
  );
  console.log("Change it from the sidebar (Change password) before the app goes online.");
  client.close();
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
