// AI chat on a person (F23, P07). The rep brainstorms with the AI, which knows the person, the
// whole conversation and the knowledge base. Chats are private to the rep who started them.
// The AI is asked first (it's slow); only when it answers are both messages saved, with an
// audit entry, in one transaction. The audit records the message count, never the text.
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { REPLY_TYPES } from "@/lib/db/enums";
import { aiChat, aiChatMessage, template, type ChatDraft } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import { addDaysIst, todayIst } from "@/lib/time";
import { situationOf } from "../conversation";
import { LeadError } from "../leads/companies";
import { boundedReplyBy, deadlineRules, leadContext, loadOwnLead, setReplyType } from "./assist";
import { runPrompt } from "./client";

export const CHAT_MESSAGE_MAX = 2000;
export const CHAT_MAX_MESSAGES = 200;
/** How much of the chat the AI reads each time (the newest messages). */
export const CHAT_HISTORY_FOR_AI = 40;
const MAX_DRAFTS = 3;

export const chatResultSchema = z.object({
  reply: z.string(),
  drafts: z.array(z.object({ approach: z.string(), text: z.string() })),
  replyType: z.enum(REPLY_TYPES).nullable(),
  replyBy: z.object({ date: z.string(), reason: z.string() }).nullable(),
  flags: z.array(z.string()),
});
export type ChatResult = z.infer<typeof chatResultSchema>;

export type ChatMessageView = {
  id: string;
  role: "rep" | "ai";
  content: string;
  drafts: ChatDraft[];
  flags: string[];
  replyBy: { date: string; reason: string } | null;
  createdAt: Date;
};
export type ChatView = { id: string; title: string; messages: ChatMessageView[] };
/** The prospect's message the AI gave a reply type to, so the rep can change it. */
export type SavedReply = { activityId: string; replyType: (typeof REPLY_TYPES)[number] };
export type ChatSummary = { id: string; title: string; updatedAt: Date; messages: number };

/** The rep's chats on this person, newest first. */
export async function listChats(
  db: DbOrTx,
  actor: Actor,
  personId: string,
): Promise<ChatSummary[]> {
  return db
    .select({
      id: aiChat.id,
      title: aiChat.title,
      updatedAt: aiChat.updatedAt,
      messages: sql<number>`(select count(*) from ai_chat_message m where m.chat_id = ${aiChat.id})`,
    })
    .from(aiChat)
    .where(and(eq(aiChat.personId, personId), eq(aiChat.userId, actor.id)))
    .orderBy(desc(aiChat.updatedAt));
}

/** One of the rep's own chats, with its messages. Anyone else's is "not found". */
export async function loadChat(db: DbOrTx, actor: Actor, chatId: string): Promise<ChatView> {
  const [chat] = await db.select().from(aiChat).where(eq(aiChat.id, chatId));
  if (!chat || chat.userId !== actor.id) throw new LeadError("That chat doesn't exist.");
  const messages = await db
    .select()
    .from(aiChatMessage)
    .where(eq(aiChatMessage.chatId, chatId))
    .orderBy(asc(aiChatMessage.createdAt), asc(aiChatMessage.role));
  return {
    id: chat.id,
    title: chat.title,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      drafts: m.drafts,
      flags: m.flags,
      replyBy: m.replyBy ?? null,
      createdAt: m.createdAt,
    })),
  };
}

/** The rep's latest chat on this person, or null if they haven't started one. */
export async function latestChat(db: DbOrTx, actor: Actor, personId: string) {
  const [first] = await listChats(db, actor, personId);
  return first ? loadChat(db, actor, first.id) : null;
}

const titleFrom = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
};

/**
 * Sends the rep's message and saves it with the AI's answer. Starts a new chat when `chatId`
 * is null. Owner or Admin only (lead.edit), and only in the rep's own chat.
 */
export async function sendChatMessage(
  db: Db,
  actor: Actor,
  personId: string,
  chatId: string | null,
  message: string,
  now = new Date(),
): Promise<ChatView & { savedReply: SavedReply | null }> {
  const text = message.trim();
  if (!text) throw new LeadError("Type a message first.");
  if (text.length > CHAT_MESSAGE_MAX) {
    throw new LeadError(`Keep it under ${CHAT_MESSAGE_MAX.toLocaleString("en-IN")} characters.`);
  }
  await loadOwnLead(db, actor, personId);
  let history: ChatMessageView[] = [];
  if (chatId) {
    const chat = await loadChat(db, actor, chatId);
    const [row] = await db.select().from(aiChat).where(eq(aiChat.id, chatId));
    if (row.personId !== personId) throw new LeadError("That chat doesn't exist.");
    if (chat.messages.length + 2 > CHAT_MAX_MESSAGES) {
      throw new LeadError("This chat is full. Start a new chat to keep going.");
    }
    history = chat.messages;
  }

  const today = todayIst(now);
  const ctx = await leadContext(db, personId, "P02", actor.id);
  const situation = await situationOf(db, personId, today);
  const replyTemplates = await db
    .select({ name: template.name, purpose: template.purpose, body: template.body })
    .from(template)
    .where(and(eq(template.status, "Active"), like(template.purpose, "Reply%")))
    .orderBy(asc(template.purpose));
  const first = ctx.PERSON.name.split(" ")[0];
  const chatSoFar = [
    ...history.slice(-(CHAT_HISTORY_FOR_AI - 1)).map((m) => ({
      from: m.role === "rep" ? "rep" : "you",
      text: m.content,
      ...(m.drafts.length ? { drafts: m.drafts } : {}),
    })),
    { from: "rep", text },
  ];

  const result = await runPrompt(
    "P07",
    chatResultSchema,
    {
      "KNOWLEDGE BASE": ctx.KNOWLEDGE_BASE,
      "CALENDAR LINK": ctx.CALENDAR_LINK,
      TODAY: today,
      PERSON: ctx.PERSON,
      "PERSONA ANGLE": ctx.PERSONA_ANGLE,
      SITUATION: {
        kind: situation.kind,
        lastMessageFrom: situation.lastFrom,
        lastChannel: situation.lastChannel,
        replyExpectedBy: situation.until,
        nudgesSent: situation.nudges,
      },
      CONVERSATION: ctx.CONVERSATION,
      "REPLY TEMPLATES": replyTemplates,
      "DEADLINE RULES": await deadlineRules(db, today),
      CHAT: chatSoFar,
    },
    () => fakeChat(text, first, today, situation.kind),
  );

  // The AI's reply type is saved on their message when it had none (as Suggest next message).
  let savedReply: SavedReply | null = null;
  if (situation.kind === "reply" && situation.replyId && result.replyType) {
    const reply = ctx.thread.find((i) => i.id === situation.replyId);
    if (reply && !reply.replyType) {
      await setReplyType(db, actor, situation.replyId, result.replyType);
      savedReply = { activityId: situation.replyId, replyType: result.replyType };
    }
  }
  const drafts = result.drafts
    .map((d) => ({ approach: d.approach.trim().slice(0, 100), text: d.text.trim() }))
    .filter((d) => d.text)
    .slice(0, MAX_DRAFTS);
  const replyBy = drafts.length ? await boundedReplyBy(db, result.replyBy, today) : null;
  const flags = result.flags.map((f) => f.trim()).filter(Boolean);
  const reply = result.reply.trim() || (drafts.length ? "Here's a draft." : "…");

  const savedId = await db.transaction(async (tx) => {
    let id = chatId;
    if (!id) {
      const [chat] = await tx
        .insert(aiChat)
        .values({ personId, userId: actor.id, title: titleFrom(text), createdBy: actor.id })
        .returning();
      id = chat.id;
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "AI chat",
        recordId: id,
        recordName: `AI chat on ${ctx.PERSON.name}`,
        action: "Created",
        after: { person: personId, messages: 0 },
      });
    }
    const before = history.length;
    // The AI's message is a millisecond later, so the order never depends on the role.
    await tx.insert(aiChatMessage).values([
      { chatId: id, role: "rep", content: text, createdAt: now },
      {
        chatId: id,
        role: "ai",
        content: reply,
        drafts,
        flags,
        replyBy,
        createdAt: new Date(now.getTime() + 1),
      },
    ]);
    await tx.update(aiChat).set({ updatedAt: new Date() }).where(eq(aiChat.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "AI chat",
      recordId: id,
      recordName: `AI chat on ${ctx.PERSON.name}`,
      action: "Updated",
      before: { messages: before },
      after: { messages: before + 2 },
    });
    return id;
  });
  return { ...(await loadChat(db, actor, savedId)), savedReply };
}

/** Deletes one of the rep's own chats. */
export async function deleteChat(db: Db, actor: Actor, chatId: string) {
  return db.transaction(async (tx) => {
    const chat = await loadChat(tx, actor, chatId);
    await tx.delete(aiChatMessage).where(eq(aiChatMessage.chatId, chatId));
    await tx.delete(aiChat).where(eq(aiChat.id, chatId));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "AI chat",
      recordId: chatId,
      recordName: chat.title,
      action: "Deleted",
      before: { messages: chat.messages.length },
    });
  });
}

/** The browser tests' stand-in for the AI. */
function fakeChat(text: string, first: string, today: string, kind: string): ChatResult {
  const shorter = /short/i.test(text);
  return {
    reply: shorter
      ? "Here's a shorter version."
      : `Here's a message for ${first}. Want it shorter or more formal?`,
    drafts: [
      shorter
        ? { approach: "Shorter", text: `Hi ${first}, 20 minutes this week for a quick demo?` }
        : {
            approach: "Book the demo",
            text: `Hi ${first}, thanks for getting back to me. Would a 20-minute demo on Tuesday at 11am or Wednesday at 4pm IST work?`,
          },
    ],
    replyType: kind === "reply" ? "Interested" : null,
    replyBy: { date: addDaysIst(today, 2), reason: "Interested: 2 business days." },
    flags: [],
  };
}
