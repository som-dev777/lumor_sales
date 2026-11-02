// F23: the AI chat on a person. Saved per person and per rep, private, owner or Admin only;
// only what the AI answers is saved; the audit records counts, never the text.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, aiChat, aiChatMessage, auditLog, person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { addEntry } from "../conversation";
import { seedKnowledge } from "../knowledge";
import { readSeedKnowledge } from "../knowledge-files";
import { createPerson, deletePerson } from "../leads/people";
import { markSent } from "./assist";
import {
  CHAT_MAX_MESSAGES,
  deleteChat,
  latestChat,
  listChats,
  loadChat,
  sendChatMessage,
} from "./chat";
import { AI_NOT_SET_UP } from "./client";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let personId: string;
const NOW = new Date("2026-10-21T06:30:00Z"); // Wednesday, 12:00 IST

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  personId = (
    await createPerson(
      t.db,
      rep,
      personSchema.parse({
        companyName: "Acme",
        fullName: "Priya Sharma",
        linkedinUrl: "linkedin.com/in/priya-chat",
        stage: "Connected",
      }),
    )
  ).id;
  await seedKnowledge(t.db, readSeedKnowledge());
  vi.stubEnv("AI_FAKE", "1");
  vi.stubEnv("DATABASE_URL", "file:test.db");
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

describe("AI chat (F23)", () => {
  it("a new chat saves the rep's message and the AI's answer with its drafts", async () => {
    const chat = await sendChatMessage(t.db, rep, personId, null, "Suggest my next message", NOW);
    expect(chat.title).toBe("Suggest my next message");
    expect(chat.messages.map((m) => m.role)).toEqual(["rep", "ai"]);
    expect(chat.messages[1].content).toContain("Priya");
    expect(chat.messages[1].drafts).toHaveLength(1);
    expect(chat.messages[1].drafts[0].approach).toBe("Book the demo");
    expect(chat.messages[1].replyBy).toEqual({
      date: "2026-10-23",
      reason: "Interested: 2 business days.",
    });

    // Continuing the same chat: the history is kept, in order.
    const next = await sendChatMessage(t.db, rep, personId, chat.id, "Make it shorter", NOW);
    expect(next.id).toBe(chat.id);
    expect(next.messages).toHaveLength(4);
    expect(next.messages[3].drafts[0]).toEqual({
      approach: "Shorter",
      text: "Hi Priya, 20 minutes this week for a quick demo?",
    });
    expect((await latestChat(t.db, rep, personId))?.messages).toHaveLength(4);
  });

  it("chats are private: nobody else sees or continues them, Admins included", async () => {
    const chat = await sendChatMessage(t.db, rep, personId, null, "Hi", NOW);
    expect(await listChats(t.db, admin, personId)).toEqual([]);
    await expect(loadChat(t.db, admin, chat.id)).rejects.toThrow("That chat doesn't exist.");
    await expect(sendChatMessage(t.db, admin, personId, chat.id, "x", NOW)).rejects.toThrow(
      "That chat doesn't exist.",
    );
    await expect(deleteChat(t.db, admin, chat.id)).rejects.toThrow("That chat doesn't exist.");
    // An Admin can start their own chat on the lead.
    await sendChatMessage(t.db, admin, personId, null, "My own", NOW);
    expect((await listChats(t.db, admin, personId)).map((c) => c.title)).toEqual(["My own"]);
    expect(await listChats(t.db, rep, personId)).toHaveLength(1);
  });

  it("only the lead's owner or an Admin can chat", async () => {
    await expect(sendChatMessage(t.db, other, personId, null, "Hi", NOW)).rejects.toThrow(
      PermissionError,
    );
  });

  it("nothing is saved when the AI isn't set up", async () => {
    vi.stubEnv("AI_FAKE", "0");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(sendChatMessage(t.db, rep, personId, null, "Hi", NOW)).rejects.toThrow(
      AI_NOT_SET_UP,
    );
    expect(await t.db.select().from(aiChat)).toEqual([]);
  });

  it("empty and too-long messages are refused; a full chat asks for a new one", async () => {
    await expect(sendChatMessage(t.db, rep, personId, null, "  ", NOW)).rejects.toThrow(
      "Type a message first.",
    );
    await expect(sendChatMessage(t.db, rep, personId, null, "x".repeat(2001), NOW)).rejects.toThrow(
      "under 2,000 characters",
    );
    const chat = await sendChatMessage(t.db, rep, personId, null, "Hi", NOW);
    await t.db.insert(aiChatMessage).values(
      Array.from({ length: CHAT_MAX_MESSAGES - 2 }, (_, i) => ({
        chatId: chat.id,
        role: i % 2 ? ("ai" as const) : ("rep" as const),
        content: "…",
      })),
    );
    await expect(sendChatMessage(t.db, rep, personId, chat.id, "More", NOW)).rejects.toThrow(
      "This chat is full",
    );
  });

  it("the audit records the message count, never the text", async () => {
    const chat = await sendChatMessage(t.db, rep, personId, null, "Secret plan", NOW);
    await sendChatMessage(t.db, rep, personId, chat.id, "Shorter", NOW);
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.entityType, "AI chat"));
    expect(audit.map((a) => a.action).sort()).toEqual(["Created", "Updated", "Updated"]);
    expect(JSON.stringify(audit)).not.toContain("Book the demo");
    expect(
      audit.some((a) => JSON.stringify(a.changes) === '{"messages":{"before":2,"after":4}}'),
    ).toBe(true);
    await deleteChat(t.db, rep, chat.id);
    expect(await t.db.select().from(aiChatMessage)).toEqual([]);
  });

  it("a used draft is logged as sent with the AI flag and sets the reply-by date", async () => {
    await addEntry(
      t.db,
      rep,
      personId,
      {
        from: "me",
        channel: "LinkedIn",
        at: new Date("2026-10-19T05:00:00Z"),
        text: "Hi Priya",
      },
      { now: NOW },
    );
    await addEntry(
      t.db,
      rep,
      personId,
      {
        from: "them",
        channel: "LinkedIn",
        at: new Date("2026-10-21T05:00:00Z"),
        text: "Tell me more",
      },
      { now: NOW },
    );
    const chat = await sendChatMessage(t.db, rep, personId, null, "What now?", NOW);
    const draft = chat.messages[1].drafts[0];
    await markSent(
      t.db,
      rep,
      personId,
      {
        text: draft.text,
        suggestion: draft.text,
        approach: draft.approach,
        replyBy: "2026-10-23",
        situation: "reply",
      },
      NOW,
    );
    const sent = (await t.db.select().from(activity)).find((a) => a.content === draft.text)!;
    expect(sent).toMatchObject({ aiSuggestionUsed: true, editLevel: "None", direction: "out" });
    const [p] = await t.db.select().from(person).where(eq(person.id, personId));
    expect(p.awaitingReplyUntil).toBe("2026-10-23");
  });

  it("deleting the person removes their chats", async () => {
    await sendChatMessage(t.db, rep, personId, null, "Hi", NOW);
    await deletePerson(t.db, admin, personId);
    expect(await t.db.select().from(aiChat)).toEqual([]);
    expect(await t.db.select().from(aiChatMessage)).toEqual([]);
  });
});
