// `npm run db:migrate`: creates or updates the database (data/app.db locally) by applying
// every migration in drizzle/ that hasn't been applied yet. Safe to run more than once.
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/lib/db/client";
import { loadEnv, requireEnv } from "./_env";

async function main() {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const { db, client } = createDb(url, process.env.DATABASE_AUTH_TOKEN);

  await migrate(db, { migrationsFolder: "drizzle" });
  const tables = await client.execute(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'",
  );
  console.log(`Database is up to date (${url}, ${tables.rows[0].n} tables).`);
  client.close();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
