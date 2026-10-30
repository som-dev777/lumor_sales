// `npm run seed:reports`: adds the default report schedules (F19) if they're missing. Safe to
// run again: schedules that exist (even edited or switched off) are left alone. The Netlify
// build runs it too.
import { createDb } from "../src/lib/db/client";
import { seedReportSchedules } from "../src/server/report-schedules";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const added = await seedReportSchedules(db);
  client.close();
  for (const name of added) console.log(`  added    ${name}`);
  console.log(`\n${added.length} report schedules added (existing ones left unchanged).`);
}

main().catch((e) => {
  console.error("Seeding the report schedules failed:", e);
  process.exit(1);
});
