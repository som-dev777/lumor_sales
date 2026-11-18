import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { LINKEDIN_EMAIL_KINDS, LINKEDIN_EMAIL_RESULTS } from "../enums";
import { baseColumns, oneOf, timestamp } from "./_shared";
import { user } from "./auth";
import { person } from "./person";

// A LinkedIn email read from a rep's Gmail (F30, D-066): "… accepted your invitation" or a new
// message. Kept so each email is read once, and to show the rep what was logged.
export const linkedinEmail = sqliteTable(
  "linkedin_email",
  {
    ...baseColumns(() => user.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // Gmail's id for the email: never read twice.
    gmailId: text("gmail_id").notNull(),
    kind: text("kind", { enum: LINKEDIN_EMAIL_KINDS }).notNull(),
    // Who LinkedIn says it's from (the person's name), and the subject.
    fromName: text("from_name"),
    subject: text("subject").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    personId: text("person_id").references(() => person.id, { onDelete: "restrict" }),
    // The activity logged from it (plain id).
    activityId: text("activity_id"),
    result: text("result", { enum: LINKEDIN_EMAIL_RESULTS }).notNull(),
  },
  (t) => [
    uniqueIndex("linkedin_email_user_gmail_idx").on(t.userId, t.gmailId),
    index("linkedin_email_user_received_idx").on(t.userId, t.receivedAt),
    check("linkedin_email_kind_check", oneOf("kind", LINKEDIN_EMAIL_KINDS)),
    check("linkedin_email_result_check", oneOf("result", LINKEDIN_EMAIL_RESULTS)),
  ],
);
