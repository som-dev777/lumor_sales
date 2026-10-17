import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseColumns, timestamp } from "./_shared";
import { user } from "./auth";

// Both tables hold exactly one row (id = 1), enforced by a CHECK constraint.
function singletonColumns() {
  const { createdAt, createdBy, updatedAt } = baseColumns(() => user.id);
  return { id: integer("id").primaryKey().default(1), createdAt, createdBy, updatedAt };
}

export const productFacts = sqliteTable(
  "product_facts",
  {
    ...singletonColumns(),
    whatLumorDoes: text("what_lumor_does"),
    liveFeatures: text("live_features"),
    featuresNotLive: text("features_not_live"),
    pricingGuidance: text("pricing_guidance"),
    positioningRules: text("positioning_rules"),
    calendarLink: text("calendar_link"),
    lastEditedBy: text("last_edited_by").references(() => user.id, { onDelete: "restrict" }),
    lastEditedAt: timestamp("last_edited_at"),
  },
  (t) => [check("product_facts_single_row", sql`${t.id} = 1`)],
);

export const playbookSettings = sqliteTable(
  "playbook_settings",
  {
    ...singletonColumns(),
    withdrawAfterDays: integer("withdraw_after_days").notNull().default(14),
    dailyConnectionTarget: integer("daily_connection_target").notNull().default(20),
    // The PRD gives no default; 10 is D-007.
    dailyMessageTarget: integer("daily_message_target").notNull().default(10),
    staleLeadDays: integer("stale_lead_days").notNull().default(21),
    // v2 cadence guardrails (F17, D-030) and the AI reply-deadline bounds (F18).
    msgAfterAcceptMinDays: integer("msg_after_accept_min_days").notNull().default(1),
    msgAfterAcceptMaxDays: integer("msg_after_accept_max_days").notNull().default(3),
    minGapDays: integer("min_gap_days").notNull().default(3),
    maxFollowUps: integer("max_follow_ups").notNull().default(4),
    weeklyTouchLimit: integer("weekly_touch_limit").notNull().default(2),
    outreachMaxDays: integer("outreach_max_days").notNull().default(30),
    outreachMaxDaysSenior: integer("outreach_max_days_senior").notNull().default(45),
    nurtureDays: integer("nurture_days").notNull().default(60),
    replyDeadlineMinDays: integer("reply_deadline_min_days").notNull().default(1),
    replyDeadlineMaxDays: integer("reply_deadline_max_days").notNull().default(10),
  },
  (t) => [
    check("playbook_settings_single_row", sql`${t.id} = 1`),
    check(
      "playbook_settings_positive",
      sql`${t.withdrawAfterDays} >= 0 AND ${t.dailyConnectionTarget} >= 0 AND ${t.dailyMessageTarget} >= 0 AND ${t.staleLeadDays} >= 0`,
    ),
  ],
);
