// `npm run seed:industries`: starts the Industries list from the industries already used by
// companies and account filters. Safe to run again: it does nothing once the list has entries.
// The Netlify build runs it too.
import { createDb } from "../src/lib/db/client";
import { seedIndustries } from "../src/server/industries";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const added = await seedIndustries(db);
  client.close();
  console.log(
    added.length
      ? `${added.length} industries added: ${added.join(", ")}.`
      : "Industries list already started.",
  );
}

main().catch((e) => {
  console.error("Seeding the industries failed:", e);
  process.exit(1);
});
