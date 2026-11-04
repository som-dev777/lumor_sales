import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { DESK_CHANNELS, DESK_KINDS, DESK_TASKS } from "../enums";
import { baseColumns, oneOf, oneOfOrNull } from "./_shared";
import { user } from "./auth";
import { person } from "./person";
import { template } from "./template";

// Outreach Desk (D-056): the rep's instructions to the AI and the AI's drafts, in a person's
// thread. Messages, replies and notes stay activities; these never count in the funnel.

export type DeskOption = { label: string; subject: string; text: string };

export const deskEntry = sqliteTable(
  "desk_entry",
  {
    ...baseColumns(() => user.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: DESK_KINDS }).notNull(),
    channel: text("channel", { enum: DESK_CHANNELS }).notNull(),
    // Drafts: what was asked for.
    task: text("task", { enum: DESK_TASKS }),
    // Instructions: the rep's words.
    content: text("content"),
    // Drafts: 2–3 options, the tip, and the output checker's warning if it still failed.
    options: text("options", { mode: "json" }).$type<DeskOption[]>(),
    tip: text("tip"),
    warning: text("warning"),
    // The template given as the style reference, carried to the activity on Mark as sent.
    templateId: text("template_id").references(() => template.id, { onDelete: "restrict" }),
    // Reply drafts: the reply they answer (plain id).
    replyActivityId: text("reply_activity_id"),
  },
  (t) => [
    check("desk_entry_kind_check", oneOf("kind", DESK_KINDS)),
    check("desk_entry_channel_check", oneOf("channel", DESK_CHANNELS)),
    check("desk_entry_task_check", oneOfOrNull("task", DESK_TASKS)),
    index("desk_entry_person_idx").on(t.personId, t.createdAt),
  ],
);
