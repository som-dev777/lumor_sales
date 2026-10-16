import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already set.
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:data/app.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
