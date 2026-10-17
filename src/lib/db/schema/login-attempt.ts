import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { flag, newId, nowMs, timestamp } from "./_shared";

// Login attempts, for pausing logins after repeated wrong passwords (D-023). Security
// telemetry, not a business record: old rows are pruned, and nothing here is audited.
export const loginAttempt = sqliteTable(
  "login_attempt",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    email: text("email").notNull(),
    succeeded: flag("succeeded").notNull(),
    occurredAt: timestamp("occurred_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
  },
  (t) => [index("login_attempt_email_idx").on(t.email, t.occurredAt)],
);
