import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;
/** A database handle or an open transaction: anything that can run queries. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Opens the database. Locally `url` is `file:data/app.db`; in production it is the
 * Turso `libsql://…` URL plus an auth token.
 */
export function createDb(url: string, authToken?: string): { db: Db; client: Client } {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    if (!path.startsWith(":memory:")) mkdirSync(dirname(path), { recursive: true });
  }
  const client = createClient({ url, authToken: authToken || undefined });
  return { db: drizzle(client, { schema }), client };
}

// One shared connection for the app. Kept on globalThis so the dev server's hot reload
// doesn't open a new connection on every code change.
const globalForDb = globalThis as unknown as { lumorDb?: { db: Db; client: Client } };

export function getDb(): Db {
  if (!globalForDb.lumorDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    globalForDb.lumorDb = createDb(url, process.env.DATABASE_AUTH_TOKEN);
  }
  return globalForDb.lumorDb.db;
}
