import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, person, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson } from "../leads/people";
import { seedKnowledge, updateKnowledge, listKnowledge } from "../knowledge";
import { readSeedKnowledge } from "../knowledge-files";
import { addEntry } from "../conversation";
import {
  applyNextStep,
  draftFromTemplate,
  markSent,
  setReplyType,
  splitConversation,
  suggestNext,
  summariseThread,
} from "./assist";
import { AI_NOT_SET_UP } from "./client";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let personId: string;

beforeEach(async () => {
  t = await createTestDb();
  const a = await insertTestUser(t.db, { name: "Somnath", role: "Admin" });
  const r = await insertTestUser(t.db, { name: "Asha" });
  const o = await insertTestUser(t.db, { name: "Ravi" });
  admin = { id: a.id, role: "Admin", active: true };
  rep = { id: r.id, role: "User", active: true };
  other = { id: o.id, role: "User", active: true };
  const p = await createPerson(
    t.db,
    rep,
    personSchema.parse({
      fullName: "Priya Sharma",
      linkedinUrl: "linkedin.com/in/priya-ai",
      stage: "Connected",
    }),
  );
  personId = p.id;
  vi.stubEnv("AI_FAKE", "1");
  vi.stubEnv("DATABASE_URL", "file:test.db");
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

const fillFacts = () => seedKnowledge(t.db, readSeedKnowledge());

const NOW = new Date("2026-10-21T06:30:00Z"); // Wednesday 21 Oct, 12:00 IST
const at = (iso: string) => new Date(iso);
const add = (from: "me" | "them", text: string, when: string, channel = "LinkedIn" as const) =>
  addEntry(t.db, rep, personId, { from, channel, at: at(when), text }, { now: NOW });
const personRow = async () => (await t.db.select().from(person).where(eq(person.id, personId)))[0];

describe("Suggest next message (F18, replaces the Reply Assistant)", () => {
  it("needs the AI knowledge base before suggesting anything", async () => {
    await add("them", "Tell me more", "2026-10-21T05:00:00Z");
    await expect(suggestNext(t.db, rep, personId, NOW)).rejects.toThrow(
      /knowledge base has no files/,
    );
    // Files that are switched off don't count either.
    await fillFacts();
    for (const f of await listKnowledge(t.db)) {
      await updateKnowledge(t.db, admin, f.id, {
        title: f.title,
        content: f.content,
        loadFor: ["P02"],
        placeLast: f.placeLast,
        active: false,
      });
    }
    await expect(suggestNext(t.db, rep, personId, NOW)).rejects.toThrow(
      /knowledge base has no files/,
    );
  });

  it("without AI set up, says so (the reply is already saved in the conversation)", async () => {
    vi.stubEnv("AI_FAKE", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    await fillFacts();
    await add("them", "Sounds interesting", "2026-10-21T05:00:00Z");
    await expect(suggestNext(t.db, rep, personId, NOW)).rejects.toThrow(AI_NOT_SET_UP);
  });

  it("their message last: a reply type (saved on it), 2–3 replies and a reply-by date", async () => {
    await fillFacts();
    await add("me", "Hi Priya, loved your post on survey design.", "2026-10-19T05:00:00Z");
    const reply = await add("them", "Tell me more", "2026-10-21T05:00:00Z");
    const r = await suggestNext(t.db, rep, personId, NOW);
    expect(r.situation).toBe("reply");
    expect(r.status).toBe("Priya replied on 21 Oct 2026. It's your turn.");
    expect(r.replyId).toBe(reply!.id);
    expect(r.replyType).toBe("Interested");
    expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestions.length).toBeLessThanOrEqual(3);
    expect(r.replyBy).toEqual({ date: "2026-10-23", reason: "Interested: 2 business days." });
    // The AI's reply type is saved on their message (D-038); the rep can still change it.
    const [a] = await t.db.select().from(activity).where(eq(activity.id, reply!.id));
    expect(a.replyType).toBe("Interested");
    await setReplyType(t.db, rep, reply!.id, "Asking for details");
    const last = (await t.db.select().from(auditLog)).at(-1)!;
    expect(last.changes).toEqual({
      replyType: { before: "Interested", after: "Asking for details" },
    });
  });

  it("the rep's message last and no reply due yet: wait, with no messages", async () => {
    await fillFacts();
    await add("me", "Hi Priya", "2026-10-20T05:00:00Z");
    const r = await suggestNext(t.db, rep, personId, NOW);
    expect(r.situation).toBe("wait");
    expect(r.status).toBe("You wrote last (20 Oct 2026). A reply is expected by 23 Oct 2026.");
    expect(r.suggestions).toEqual([]);
  });

  it("nothing logged: start the conversation", async () => {
    await fillFacts();
    const r = await suggestNext(t.db, rep, personId, NOW);
    expect(r.situation).toBe("start");
    expect(r.suggestions).toHaveLength(1);
  });

  it("Users can't use it on someone else's lead", async () => {
    await fillFacts();
    await expect(suggestNext(t.db, other, personId, NOW)).rejects.toThrow(PermissionError);
  });
});

describe("Mark as sent with a reply-by date (F18)", () => {
  it("saves the confirmed date; a nudge counts, needs a date, and a close clears it", async () => {
    const msg = { suggestion: "Hi Priya", text: "Hi Priya" };
    await markSent(t.db, rep, personId, { ...msg, replyBy: "2026-10-23", situation: "reply" }, NOW);
    expect(await personRow()).toMatchObject({ awaitingReplyUntil: "2026-10-23", nudgeCount: 0 });
    // Outside the Playbook Settings bounds (1–10 days).
    await expect(
      markSent(t.db, rep, personId, { ...msg, replyBy: "2026-11-05", situation: "reply" }, NOW),
    ).rejects.toThrow("Pick a reply-by date 1–10 days after the message.");
    await expect(
      markSent(t.db, rep, personId, { ...msg, situation: "nudge" }, NOW),
    ).rejects.toThrow("Pick the date you expect a reply by.");
    await markSent(t.db, rep, personId, { ...msg, replyBy: "2026-10-26", situation: "nudge" }, NOW);
    expect(await personRow()).toMatchObject({ awaitingReplyUntil: "2026-10-26", nudgeCount: 1 });
    const row = await markSent(
      t.db,
      rep,
      personId,
      { ...msg, situation: "close", channel: "Email" },
      NOW,
    );
    expect(row).toMatchObject({ type: "Message sent", channel: "Email", direction: "out" });
    expect(await personRow()).toMatchObject({ awaitingReplyUntil: null, nudgeCount: 1 });
  });

  it("their reply clears the date and the nudge count", async () => {
    await markSent(
      t.db,
      rep,
      personId,
      { suggestion: "x", text: "x", replyBy: "2026-10-26", situation: "nudge" },
      at("2026-10-21T04:00:00Z"),
    );
    // A reply from before the nudge is history: what the rep is waiting for stays.
    await add("them", "An older message", "2026-10-20T06:00:00Z");
    expect(await personRow()).toMatchObject({ awaitingReplyUntil: "2026-10-26", nudgeCount: 1 });
    await add("them", "Sorry, busy week!", "2026-10-21T06:00:00Z");
    expect(await personRow()).toMatchObject({ awaitingReplyUntil: null, nudgeCount: 0 });
  });

  it("refuses for someone marked Do not contact", async () => {
    await t.db.update(person).set({ doNotContact: true }).where(eq(person.id, personId));
    await expect(
      markSent(t.db, rep, personId, { suggestion: "x", text: "x" }, NOW),
    ).rejects.toThrow("Do not contact");
  });
});

describe("Split conversation (P05)", () => {
  it("splits pasted text for review, flags messages already saved and drops future times", async () => {
    await add("me", "Hi Priya, loved your post.", "2026-10-19T05:00:00Z");
    const r = await splitConversation(
      t.db,
      rep,
      personId,
      [
        "[2026-10-19 10:30] Me: Hi Priya, loved your post.",
        "[2026-10-20 18:05] Them: Thanks! What does recruitment cost?",
        "Me: It depends on the audience.",
        "[2026-10-25 09:00] Them: A future time",
      ].join("\n"),
      NOW,
    );
    expect(r.rows).toEqual([
      { from: "me", at: "2026-10-19T10:30", text: "Hi Priya, loved your post.", duplicate: true },
      {
        from: "them",
        at: "2026-10-20T18:05",
        text: "Thanks! What does recruitment cost?",
        duplicate: false,
      },
      { from: "me", at: "", text: "It depends on the audience.", duplicate: false },
      { from: "them", at: "", text: "A future time", duplicate: false },
    ]);
    await expect(splitConversation(t.db, other, personId, "Me: hi", NOW)).rejects.toThrow(
      PermissionError,
    );
  });
});

describe("Mark as sent and Confirm", () => {
  it("logs the message with approach, AI used and edit level", async () => {
    const row = await markSent(t.db, rep, personId, {
      suggestion: "Would Tuesday 11am or Wednesday 4pm work for a 20-minute demo?",
      text: "Would Tuesday 11am or Wednesday 4pm work for a quick 20-minute demo?",
      approach: "Book the demo",
    });
    expect(row).toMatchObject({
      type: "Message sent",
      aiSuggestionUsed: true,
      suggestionApproach: "Book the demo",
      editLevel: "Light",
    });
    await expect(
      markSent(t.db, rep, personId, { suggestion: "Hi {Name}", text: "Hi {Name}" }),
    ).rejects.toThrow("Fill in {Name} first.");
  });

  it("a drafted template is logged with its A/B/C version", async () => {
    await fillFacts();
    const [tpl] = await t.db
      .insert(template)
      .values({
        name: "Opener",
        type: "Official",
        ownerId: admin.id,
        purpose: "Message 1",
        level: "Any",
        version: "B",
        body: "Hi {Name}, saw your work at {Company}.",
      })
      .returning();
    const draft = await draftFromTemplate(t.db, rep, personId, tpl.id);
    // Unknown placeholders stay visible and the rep is told (guardrails file, D-037).
    expect(draft).toEqual({
      message: "Hi Priya, saw your work at {Company}.",
      notes: ["Fill in {Company}."],
    });
    await expect(
      markSent(t.db, rep, personId, {
        suggestion: draft.message,
        text: draft.message,
        templateId: tpl.id,
      }),
    ).rejects.toThrow("Fill in {Company} first.");
    const text = "Hi Priya, saw your work at Acme.";
    const row = await markSent(t.db, rep, personId, {
      suggestion: draft.message,
      text,
      templateId: tpl.id,
    });
    expect(row).toMatchObject({ templateId: tpl.id, templateVersion: "B", editLevel: "Heavy" });
  });

  it("Confirm sets stage and next action, logs the stage change; never Lost or Paid", async () => {
    await applyNextStep(t.db, rep, personId, {
      stage: "Meeting scheduled",
      nextAction: "Hold meeting",
      nextActionDate: "2026-10-22",
    });
    const [p] = await t.db.select().from(person).where(eq(person.id, personId));
    expect(p).toMatchObject({
      stage: "Meeting scheduled",
      nextAction: "Hold meeting",
      nextActionDate: "2026-10-22",
    });
    const [a] = await t.db.select().from(activity).where(eq(activity.personId, personId));
    expect(a.content).toBe("Connected → Meeting scheduled");
    await expect(
      applyNextStep(t.db, rep, personId, {
        stage: "Paid",
        nextAction: "",
        nextActionDate: "2026-10-22",
      }),
    ).rejects.toThrow();
    await expect(
      applyNextStep(t.db, other, personId, {
        stage: "Replied",
        nextAction: "x",
        nextActionDate: "2026-10-22",
      }),
    ).rejects.toThrow(PermissionError);
  });
});

describe("Summarise (F10, reads the conversation from R8)", () => {
  it("needs something in the conversation first", async () => {
    await fillFacts();
    await expect(summariseThread(t.db, rep, personId, NOW)).rejects.toThrow(
      "There's nothing in the conversation yet.",
    );
  });

  it("returns summary, needs, objections and a next step", async () => {
    await fillFacts();
    await add("me", "Hi Priya", "2026-10-19T05:00:00Z");
    await add("them", "Interested!", "2026-10-20T05:00:00Z");
    const r = await summariseThread(t.db, rep, personId, NOW);
    expect(r.summary).toContain("Priya Sharma");
    expect(r.needs.length).toBeGreaterThan(0);
    expect(r.nextStep.stage).toBe("Replied");
  });
});
