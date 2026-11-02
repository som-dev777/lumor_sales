import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { NOTIFICATION_KINDS } from "../enums";
import { baseColumns, oneOf, timestamp } from "./_shared";
import { user } from "./auth";
import { booking } from "./calendar";

// In-app notifications (F25): one row per rep per event, private to that rep.
export const notification = sqliteTable(
  "notification",
  {
    ...baseColumns(() => user.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // An app path, e.g. /calendar?booking=…
    link: text("link"),
    bookingId: text("booking_id").references(() => booking.id, { onDelete: "restrict" }),
    readAt: timestamp("read_at"),
  },
  (t) => [
    check("notification_kind_check", oneOf("kind", NOTIFICATION_KINDS)),
    index("notification_user_idx").on(t.userId, t.createdAt),
    index("notification_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);
