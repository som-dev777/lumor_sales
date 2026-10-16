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
    followUp1DelayDays: integer("follow_up_1_delay_days").notNull().default(4),
    followUp2DelayDays: integer("follow_up_2_delay_days").notNull().default(7),
    breakUpDelayDays: integer("break_up_delay_days").notNull().default(10),
    withdrawAfterDays: integer("withdraw_after_days").notNull().default(14),
    dailyConnectionTarget: integer("daily_connection_target").notNull().default(20),
    // The PRD gives no default; 10 is D-007.
    dailyMessageTarget: integer("daily_message_target").notNull().default(10),
    staleLeadDays: integer("stale_lead_days").notNull().default(21),
  },
  (t) => [
    check("playbook_settings_single_row", sql`${t.id} = 1`),
    check(
      "playbook_settings_positive",
      sql`${t.followUp1DelayDays} >= 0 AND ${t.followUp2DelayDays} >= 0 AND ${t.breakUpDelayDays} >= 0 AND ${t.withdrawAfterDays} >= 0 AND ${t.dailyConnectionTarget} >= 0 AND ${t.dailyMessageTarget} >= 0 AND ${t.staleLeadDays} >= 0`,
    ),
  ],
);
