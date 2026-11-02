import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { REPORT_FREQUENCIES, REPORT_RECIPIENTS, REPORT_SCOPES } from "../enums";
import { baseColumns, flag, jsonList, oneOf, oneOfOrNull, timestamp } from "./_shared";
import { user } from "./auth";

// Reports (F19): schedules Admins set up, and every report made (a saved snapshot).

export const reportSchedule = sqliteTable(
  "report_schedule",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull().unique(),
    frequency: text("frequency", { enum: REPORT_FREQUENCIES }).notNull(),
    // "HH:mm" in IST.
    timeOfDay: text("time_of_day").notNull(),
    // Weekly: 1 (Monday) to 7 (Sunday). Monthly and longer: day of the month, 1–28.
    day: integer("day"),
    scope: text("scope", { enum: REPORT_SCOPES }).notNull(),
    // For scope "person".
    personUserId: text("person_user_id").references(() => user.id, { onDelete: "restrict" }),
    recipients: text("recipients", { enum: REPORT_RECIPIENTS }).notNull(),
    // For recipients "emails".
    emails: jsonList("emails"),
    active: flag("active").notNull().default(true),
    nextRunAt: timestamp("next_run_at").notNull(),
    lastRunAt: timestamp("last_run_at"),
  },
  (t) => [
    check("report_schedule_frequency_check", oneOf("frequency", REPORT_FREQUENCIES)),
    check("report_schedule_scope_check", oneOf("scope", REPORT_SCOPES)),
    check("report_schedule_recipients_check", oneOf("recipients", REPORT_RECIPIENTS)),
    check("report_schedule_active_check", sql`${t.active} IN (0, 1)`),
    check(
      "report_schedule_person_check",
      sql`${t.scope} <> 'person' OR ${t.personUserId} IS NOT NULL`,
    ),
    index("report_schedule_due_idx").on(t.active, t.nextRunAt),
  ],
);

export const reportRun = sqliteTable(
  "report_run",
  {
    ...baseColumns(() => user.id),
    // "team" or "person" (a run is always about the team or one person).
    scope: text("scope", { enum: REPORT_SCOPES }).notNull(),
    personUserId: text("person_user_id").references(() => user.id, { onDelete: "restrict" }),
    // Plain IST dates, both included.
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    title: text("title").notNull(),
    // The report as it was when made (JSON), so it never changes later.
    data: text("data", { mode: "json" }).notNull(),
    aiSummary: text("ai_summary"),
    // Empty when a schedule made it.
    generatedBy: text("generated_by").references(() => user.id, { onDelete: "restrict" }),
    scheduleId: text("schedule_id").references(() => reportSchedule.id, { onDelete: "restrict" }),
    emailedTo: jsonList("emailed_to"),
    // Teammates it was sent to (D-043): they can open it and see it under Shared with me.
    sharedWith: jsonList("shared_with"),
  },
  (t) => [
    check("report_run_scope_check", oneOfOrNull("scope", ["team", "person"])),
    check("report_run_person_check", sql`${t.scope} <> 'person' OR ${t.personUserId} IS NOT NULL`),
    index("report_run_created_idx").on(t.createdAt),
    index("report_run_person_idx").on(t.personUserId),
  ],
);
