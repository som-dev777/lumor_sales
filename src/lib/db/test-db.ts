// Test helper: a fresh, fully migrated database in a temporary folder.
// (A real file, not :memory:, because libSQL gives each transaction its own connection.)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "./client";
import { user } from "./schema";

export async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "lumor-test-"));
  const { db, client } = createDb(`file:${join(dir, "test.db")}`);
  await migrate(db, { migrationsFolder: "drizzle" });
  return {
    db,
    client,
    cleanup() {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function insertTestUser(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  overrides: Partial<typeof user.$inferInsert> = {},
) {
  const [row] = await db
    .insert(user)
    .values({
      name: "Test User",
      email: `${crypto.randomUUID()}@example.com`,
      ...overrides,
    })
    .returning();
  return row;
}

/** Runs `fn`, expects it to fail, and returns the full error text (including the DB cause). */
export async function dbErrorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const parts: string[] = [];
    let err: unknown = e;
    while (err instanceof Error) {
      parts.push(err.message);
      err = err.cause;
    }
    return parts.join(" | ");
  }
  throw new Error("Expected the database to reject this, but it succeeded.");
}
