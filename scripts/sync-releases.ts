// `npm run releases:sync`: copies released versions from docs/CHANGELOG.md into the database,
// so the About page shows them. Safe to run any time; existing releases are left alone.
// Run it after every release or patch (D-004), locally and against production.
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/client";
import { parseChangelog, syncReleases } from "../src/server/releases";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const releases = parseChangelog(readFileSync("docs/CHANGELOG.md", "utf8"));
  const { db, client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const added = await syncReleases(db, releases);
  client.close();

  if (releases.length === 0) {
    console.log("No released versions in the CHANGELOG yet (only Unreleased). Nothing to add.");
  } else if (added.length === 0) {
    console.log(`All ${releases.length} release(s) are already in the database.`);
  } else {
    for (const r of added) console.log(`  added v${r.version} (${r.releaseDate}): ${r.summary}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
