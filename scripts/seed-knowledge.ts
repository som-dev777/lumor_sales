// `npm run seed:knowledge`: loads the starting AI knowledge base (F20) from docs/ai-knowledge.
// Safe to run again: files that already exist are left alone, so edits made in the app are
// kept. The Netlify build runs it too.
import { createDb } from "../src/lib/db/client";
import { seedKnowledge } from "../src/server/knowledge";
import { readSeedKnowledge } from "../src/server/knowledge-files";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const { added, skipped } = await seedKnowledge(db, readSeedKnowledge());
  client.close();
  for (const slug of added) console.log(`  added    ${slug}.md`);
  console.log(`\n${added.length} added, ${skipped.length} already there (left unchanged).`);
}

main().catch((e) => {
  console.error("Seeding the knowledge base failed:", e);
  process.exit(1);
});
