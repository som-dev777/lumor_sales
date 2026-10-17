// `npm run db:migrate`: creates or updates the database (data/app.db locally) by applying
// every migration in drizzle/ that hasn't been applied yet. Safe to run more than once.
// Before changing a local database file it makes a backup in data/backups/ (D-029), and
// afterwards it checks that no row points at a missing row.
import { migrate } from "drizzle-orm/libsql/migrator";
import { backupLocalDb, pendingMigrations } from "../src/lib/db/backup";
import { createDb } from "../src/lib/db/client";
import { loadEnv, requireEnv } from "./_env";

async function stageCounts(client: ReturnType<typeof createDb>["client"]) {
  try {
    const rs = await client.execute(
      "SELECT stage, count(*) AS n FROM person GROUP BY stage ORDER BY stage",
    );
    return rs.rows.map((r) => `${r.stage}: ${r.n}`).join(", ") || "no people";
  } catch {
    return "no people table yet";
  }
}

async function main() {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const { db, client } = createDb(url, process.env.DATABASE_AUTH_TOKEN);

  const pending = await pendingMigrations(client);
  if (pending.length > 0) {
    const backup = backupLocalDb(url, pending[0]);
    if (backup) console.log(`Backup saved: ${backup}`);
    console.log(`Applying: ${pending.join(", ")}`);
    console.log(`People per stage before: ${await stageCounts(client)}`);
  }

  await migrate(db, { migrationsFolder: "drizzle" });

  const broken = await client.execute("PRAGMA foreign_key_check");
  if (broken.rows.length > 0) {
    console.error(
      `Foreign key check failed: ${broken.rows.length} broken links. Restore the backup.`,
    );
    process.exit(1);
  }
  if (pending.length > 0) console.log(`People per stage after: ${await stageCounts(client)}`);
  const tables = await client.execute(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'",
  );
  console.log(`Database is up to date (${url}, ${tables.rows[0].n} tables).`);
  client.close();
}

main().catch((e) => {
  console.error("Migration failed, nothing was changed:", e);
  process.exit(1);
});
