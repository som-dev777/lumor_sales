import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./_shared";
import { user } from "./auth";

// Filled from docs/CHANGELOG.md by `npm run releases:sync` (F16).
export const appRelease = sqliteTable("app_release", {
  ...baseColumns(() => user.id),
  version: text("version").notNull().unique(),
  // Plain IST date, YYYY-MM-DD.
  releaseDate: text("release_date").notNull(),
  summary: text("summary").notNull(),
  changes: text("changes", { mode: "json" }).$type<string[]>().notNull(),
});
