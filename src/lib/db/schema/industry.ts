import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./_shared";
import { user } from "./auth";

// Industries (owner, 2026-10-30): one shared list for companies and account filters.
export const industry = sqliteTable(
  "industry",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull(),
  },
  // "Market Research" and "market research" are the same industry.
  (t) => [uniqueIndex("industry_name_unique").on(sql`lower(${t.name})`)],
);
