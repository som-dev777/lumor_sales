import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { CHAT_ROLES } from "../enums";
import { baseColumns, jsonList, newId, oneOf, timestamp } from "./_shared";
import { user } from "./auth";
import { person } from "./person";

// AI chat on a person (F23): each chat belongs to one rep and one person, and is private.

export const aiChat = sqliteTable(
  "ai_chat",
  {
    ...baseColumns(() => user.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    // The rep who started it; only they see it.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // The first words of the rep's first message.
    title: text("title").notNull(),
  },
  (t) => [index("ai_chat_person_user_idx").on(t.personId, t.userId, t.updatedAt)],
);

export type ChatDraft = { approach: string; text: string };

export const aiChatMessage = sqliteTable(
  "ai_chat_message",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    chatId: text("chat_id")
      .notNull()
      .references(() => aiChat.id, { onDelete: "restrict" }),
    // "rep" (the person typing) or "ai".
    role: text("role", { enum: CHAT_ROLES }).notNull(),
    content: text("content").notNull(),
    // The AI's ready-to-send messages, if any.
    drafts: jsonList<ChatDraft>("drafts"),
    flags: jsonList("flags"),
    // The reply-by date the AI suggested with its drafts (YYYY-MM-DD), if any.
    replyBy: text("reply_by", { mode: "json" }).$type<{ date: string; reason: string } | null>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
      .$defaultFn(() => new Date()),
  },
  (t) => [
    check("ai_chat_message_role_check", oneOf("role", CHAT_ROLES)),
    index("ai_chat_message_chat_idx").on(t.chatId, t.createdAt),
  ],
);
