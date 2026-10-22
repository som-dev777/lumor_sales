import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, person, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson } from "../leads/people";
import { seedKnowledge, updateKnowledge, listKnowledge } from "../knowledge";
import { readSeedKnowledge } from "../knowledge-files";
import {
  applyNextStep,
  draftFromTemplate,
  markSent,
  savePastedReply,
  setReplyType,
  suggestReplies,
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

describe("Reply Assistant (F09)", () => {
  it("the pasted reply is saved before the AI runs, even when AI isn't set up", async () => {
    vi.stubEnv("AI_FAKE", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const saved = await savePastedReply(t.db, rep, personId, "Sounds interesting, tell me more");
    expect(saved).toMatchObject({
      type: "Reply received",
      replyType: null,
      content: "Sounds interesting, tell me more",
    });
    const [p] = await t.db.select().from(person).where(eq(person.id, personId));
    expect(p).toMatchObject({ stage: "Replied", nextAction: "Respond" });
    await fillFacts();
    await expect(suggestReplies(t.db, rep, saved.id)).rejects.toThrow(AI_NOT_SET_UP);
  });

  it("needs the AI knowledge base before suggesting anything", async () => {
    const saved = await savePastedReply(t.db, rep, personId, "Tell me more");
    await expect(suggestReplies(t.db, rep, saved.id)).rejects.toThrow(
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
    await expect(suggestReplies(t.db, rep, saved.id)).rejects.toThrow(
      /knowledge base has no files/,
    );
  });

  it("returns a reply type, 2–3 suggestions and a next step; the rep can change the type", async () => {
    await fillFacts();
    const saved = await savePastedReply(t.db, rep, personId, "Tell me more");
    const r = await suggestReplies(t.db, rep, saved.id);
    expect(r.replyType).toBe("Interested");
    expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestions.length).toBeLessThanOrEqual(3);
    expect(r.nextStep.stage).toBe("Replied");

    await setReplyType(t.db, rep, saved.id, "Asking for details");
    const [a] = await t.db.select().from(activity).where(eq(activity.id, saved.id));
    expect(a.replyType).toBe("Asking for details");
    const last = (await t.db.select().from(auditLog)).at(-1)!;
    expect(last.changes).toEqual({ replyType: { before: null, after: "Asking for details" } });
  });

  it("Users can't use it on someone else's lead", async () => {
    await expect(savePastedReply(t.db, other, personId, "x")).rejects.toThrow(PermissionError);
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

describe("Summarise (F10)", () => {
  it("returns summary, needs, objections and a next step", async () => {
    await fillFacts();
    const r = await summariseThread(t.db, rep, personId, "Me: hi\nPriya: interested");
    expect(r.summary).toContain("Priya Sharma");
    expect(r.needs.length).toBeGreaterThan(0);
    expect(r.nextStep.stage).toBe("Replied");
  });
});
