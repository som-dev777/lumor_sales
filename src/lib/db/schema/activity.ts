import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ACTIVITY_TYPES, CHANNELS, EDIT_LEVELS, REPLY_TYPES, TEMPLATE_VERSIONS } from "../enums";
import { baseColumns, flag, oneOf, oneOfOrNull, timestamp } from "./_shared";
import { user } from "./auth";
import { company } from "./company";
import { person } from "./person";
import { template } from "./template";

export const activity = sqliteTable(
  "activity",
  {
    ...baseColumns(() => user.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    companyId: text("company_id").references(() => company.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at").notNull(),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    channel: text("channel", { enum: CHANNELS }).notNull().default("LinkedIn"),
    content: text("content"),
    replyType: text("reply_type", { enum: REPLY_TYPES }),
    templateId: text("template_id").references(() => template.id, { onDelete: "restrict" }),
    templateVersion: text("template_version", { enum: TEMPLATE_VERSIONS }),
    aiSuggestionUsed: flag("ai_suggestion_used").notNull().default(false),
    suggestionApproach: text("suggestion_approach"),
    editLevel: text("edit_level", { enum: EDIT_LEVELS }),
  },
  (t) => [
    check("activity_type_check", oneOf("type", ACTIVITY_TYPES)),
    check("activity_channel_check", oneOf("channel", CHANNELS)),
    check("activity_reply_type_check", oneOfOrNull("reply_type", REPLY_TYPES)),
    // PRD: reply type only on "Reply received" activities.
    check(
      "activity_reply_type_only_on_reply",
      sql`${t.replyType} IS NULL OR ${t.type} = 'Reply received'`,
    ),
    check("activity_template_version_check", oneOfOrNull("template_version", TEMPLATE_VERSIONS)),
    check("activity_edit_level_check", oneOfOrNull("edit_level", EDIT_LEVELS)),
    check("activity_ai_suggestion_used_check", sql`${t.aiSuggestionUsed} IN (0, 1)`),
    index("activity_person_time_idx").on(t.personId, t.occurredAt),
    index("activity_user_time_idx").on(t.userId, t.occurredAt),
    index("activity_type_time_idx").on(t.type, t.occurredAt),
  ],
);
