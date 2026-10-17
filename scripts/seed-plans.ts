// `npm run seed:plans`: loads the seed plans (F17): the Official Outreach plan and three drafts
// (Meeting follow-up, Trial, Onboarding) proposed for an Admin to approve. Safe to run again:
// plans that already exist are left alone. The Netlify build runs it too.
import { DEFAULT_ADMIN_EMAILS } from "../src/lib/auth-rules";
import { createDb } from "../src/lib/db/client";
import { seedPlans } from "../src/server/plans/seed";
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
  const { added, skipped } = await seedPlans(db, owner.id);
  client.close();
  for (const name of added) console.log(`  added    ${name}`);
  console.log(`\n${added.length} added, ${skipped.length} already there (left unchanged).`);
}

main().catch((e) => {
  console.error("Seeding plans failed:", e);
  process.exit(1);
});
