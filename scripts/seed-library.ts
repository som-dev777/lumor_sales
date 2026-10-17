// `npm run seed:library`: loads the PRD's starting playbook (5 personas, 6 account filters,
// 12 templates) as Official items owned by the first default Admin. Safe to run again:
// existing items are left alone, so edits made in the app are kept.
import { DEFAULT_ADMIN_EMAILS } from "../src/lib/auth-rules";
import { createDb } from "../src/lib/db/client";
import { seedLibrary } from "../src/server/library/seed";
import { findUserByEmail } from "../src/server/users";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const owner = await findUserByEmail(db, DEFAULT_ADMIN_EMAILS[0]);
  if (!owner) {
    console.error(`${DEFAULT_ADMIN_EMAILS[0]} doesn't exist yet. Run: npm run seed:admin`);
    client.close();
    process.exit(1);
  }

  const { added, skipped } = await seedLibrary(db, owner.id);
  client.close();
  for (const item of added) console.log(`  added    ${item}`);
  console.log(
    `\n${added.length} added, ${skipped.length} already there (left unchanged). Owner: ${owner.email}.`,
  );
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
