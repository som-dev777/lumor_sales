import { sql, type SQL } from "drizzle-orm";
import { integer, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

// Current time as UTC milliseconds, for SQL-side defaults (used by raw inserts and triggers).
export const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

/** A date-time column: stored as UTC milliseconds, read as a JS Date. */
export const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

/** A yes/no column: stored as 0/1, read as a boolean. */
export const flag = (name: string) => integer(name, { mode: "boolean" });

/** A list column: stored as JSON text. */
export const jsonList = <T = string>(name: string) =>
  text(name, { mode: "json" })
    .$type<T[]>()
    .notNull()
    .default(sql`'[]'`);

export const newId = () => crypto.randomUUID();

/**
 * Builds a CHECK expression: `"column" IN ('a', 'b', …)`.
 * Values are fixed lists from enums.ts, written into the schema (never user input).
 */
export function oneOf(column: string, values: readonly (string | number)[]): SQL {
  return sql.raw(inList(column, values));
}

/** Same as oneOf, but the column may also be empty (NULL). */
export function oneOfOrNull(column: string, values: readonly (string | number)[]): SQL {
  return sql.raw(`"${column}" IS NULL OR ${inList(column, values)}`);
}

function inList(column: string, values: readonly (string | number)[]): string {
  const list = values
    .map((v) => (typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`))
    .join(", ");
  return `"${column}" IN (${list})`;
}

/**
 * The four columns every Lumor table has: id, created_at, created_by, updated_at.
 * `userId` is passed in lazily to avoid a circular import with the user table.
 */
export function baseColumns(userId: () => AnySQLiteColumn) {
  return {
    id: text("id").primaryKey().$defaultFn(newId),
    createdAt: timestamp("created_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
    createdBy: text("created_by").references(userId, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  };
}
