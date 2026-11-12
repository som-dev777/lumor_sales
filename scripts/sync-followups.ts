// `npm run sync:followups`: puts each person's follow-up and their active plan's next date in
// line, once (D-061). Safe to run again: people already in line are left alone. Every change is
// audited. The Netlify build runs it after the migrations.
import { createDb } from "../src/lib/db/client";
import { syncPlanFollowUps } from "../src/server/plans/enrolment";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const changed = await syncPlanFollowUps(db);
  client.close();
  console.log(`Follow-ups in line with plans: ${changed} changed.`);
}

main().catch((e) => {
  console.error("Syncing follow-ups failed:", e);
  process.exit(1);
});
