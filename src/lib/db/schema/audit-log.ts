import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { AUDIT_ACTIONS } from "../enums";
import { baseColumns, oneOf, timestamp } from "./_shared";
import { user } from "./auth";

export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

// Insert-only (F14). Database triggers reject every UPDATE and DELETE on this table;
// see drizzle/*_lock_audit_log_and_users.sql.
export const auditLog = sqliteTable(
  "audit_log",
  {
    ...baseColumns(() => user.id),
    occurredAt: timestamp("occurred_at")
      .notNull()
      .$defaultFn(() => new Date()),
    // Empty for system actions (e.g. the seed script).
    userId: text("user_id").references(() => user.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    recordName: text("record_name").notNull(),
    recordId: text("record_id").notNull(),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    changes: text("changes", { mode: "json" }).$type<AuditChanges>().notNull(),
  },
  (t) => [
    check("audit_log_action_check", oneOf("action", AUDIT_ACTIONS)),
    index("audit_log_occurred_at_idx").on(t.occurredAt),
    index("audit_log_record_idx").on(t.entityType, t.recordId),
    index("audit_log_user_idx").on(t.userId),
  ],
);
