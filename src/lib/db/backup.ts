// Safety net for migrations (D-029): before applying pending migrations to a local database
// file, copy it to data/backups/. Turso (production) is backed up by hand (docs/deploy.md).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Client } from "@libsql/client";

type Journal = { entries: { tag: string; when: number }[] };

/** Migrations in the folder that this database hasn't applied yet (oldest first). */
export async function pendingMigrations(client: Client, folder = "drizzle") {
  const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8")) as Journal;
  let last = 0;
  try {
    const rs = await client.execute(
      "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    last = rs.rows.length ? Number(rs.rows[0].created_at) : 0;
  } catch {
    // No migrations table yet: a brand-new database.
  }
  return journal.entries.filter((e) => e.when > last).map((e) => e.tag);
}

/** Copies a local database file before migrating. Returns the backup path, or null if none. */
export function backupLocalDb(url: string, nextTag: string, now = new Date()): string | null {
  if (!url.startsWith("file:")) return null;
  const path = url.slice("file:".length);
  if (path.startsWith(":memory:") || !existsSync(path)) return null;
  const dir = join(dirname(path), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = join(dir, `${basename(path, ".db")}-${stamp}-before-${nextTag}.db`);
  copyFileSync(path, target);
  return target;
}
