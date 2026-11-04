// Outreach Desk (D-056): the transcript format, prompt assembly, the output checker, placeholder
// blocking, and the activities the Desk logs (the same types as before, audited).
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activity,
  aiChat,
  aiChatMessage,
  auditLog,
  deskEntry,
  knowledgeFile,
  person,
  plan,
  planEnrolment,
  template,
  user,
} from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { seedKnowledge } from "../knowledge";
import { readSeedKnowledge } from "../knowledge-files";
import { createPerson } from "../leads/people";
import { enrolPeople } from "../plans/enrolment";
import { seedPlans } from "../plans/seed";
import {
  addDeskInfo,
  addDeskReply,
  checkDraft,
  deskInput,
  draftOnDesk,
  markDeskSent,
  purposesFor,
  replyTypeOf,
  setBrief,
  setJobTitle,
  taskText,
  upcomingFeatureNames,
  writingRulesFor,
} from "./desk";
import {
  activityItem,
  deskThread,
  transcript,
  type ActivityRow,
  type DeskItem,
} from "./desk-thread";
import { readFileSync } from "node:fs";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let personId: string;
const NOW = new Date("2026-11-04T06:30:00Z");

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath Chakraborty", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  personId = (
    await createPerson(
      t.db,
      rep,
      personSchema.parse({
        companyName: "Acme",
        fullName: "Priya Sharma",
        title: "Head of Research",
        linkedinUrl: "linkedin.com/in/priya-desk",
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

const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: "a",
  at: NOW,
  type: "Message sent",
  channel: "LinkedIn",
  deskChannel: null,
  direction: "out",
  content: "Hi",
  subject: null,
  replyType: null,
  requestNote: false,
  suggestionApproach: null,
  toStage: null,
  userName: "Asha Rao",
  ...over,
});

describe("old activities on the thread (display only)", () => {
  it("maps each type to a thread entry", () => {
    expect(activityItem(row({ type: "Reply received", direction: "in" })).kind).toBe("them");
    const sent = activityItem(row({ type: "InMail sent", channel: "InMail" }));
    expect(sent).toMatchObject({ kind: "sent", channel: "LinkedIn InMail", called: false });
    expect(activityItem(row({ type: "Call", channel: "Call" }))).toMatchObject({
      kind: "sent",
      called: true,
    });
    expect(
      activityItem(row({ type: "Request sent", direction: null, requestNote: true })),
    ).toMatchObject({ kind: "sent", channel: "LinkedIn connection note" });
    expect(
      activityItem(row({ type: "Request sent", direction: null, content: null })),
    ).toMatchObject({
      kind: "sent",
      channel: "LinkedIn connection request",
      text: "Connection request",
    });
    expect(activityItem(row({ type: "Meeting note", direction: null })).kind).toBe("info");
    expect(
      activityItem(row({ type: "Meeting note", direction: "out", channel: "In person" })),
    ).toMatchObject({ kind: "sent", channel: "In person" });
    expect(
      activityItem(row({ type: "Stage change", direction: null, content: "A → B" })),
    ).toMatchObject({ kind: "event", label: "Stage change", text: "A → B" });
    // The desk channel wins when saved.
    expect(
      activityItem(row({ type: "Message sent", deskChannel: "LinkedIn connection note" })),
    ).toMatchObject({ channel: "LinkedIn connection note" });
  });
});

describe("transcript (spec section 7)", () => {
  it("formats each kind and keeps the last 40", () => {
    const base = { at: NOW, who: "Asha Rao" };
    const items: DeskItem[] = [
      { ...base, id: "1", kind: "them", channel: "WhatsApp", text: "Sounds good", replyType: null },
      {
        ...base,
        id: "2",
        kind: "sent",
        channel: "Email",
        called: false,
        subject: "Hello",
        text: "Body",
        approach: null,
      },
      {
        ...base,
        id: "3",
        kind: "sent",
        channel: "Call",
        called: true,
        subject: null,
        text: "Track",
        approach: null,
      },
      { ...base, id: "4", kind: "info", text: "Met at a meetup" },
      { ...base, id: "5", kind: "ask", text: "make it shorter", source: "desk" },
      {
        ...base,
        id: "6",
        kind: "draft",
        channel: "LinkedIn message",
        task: "next",
        options: [
          { label: "A", subject: "", text: "One" },
          { label: "B", subject: "", text: "Two" },
        ],
        tip: null,
        warning: null,
        templateId: null,
        source: "desk",
        sent: [],
      },
      { ...base, id: "7", kind: "event", label: "Stage change", text: "x" },
    ];
    expect(transcript(items, "Priya Sharma")).toBe(
      [
        "[Priya replied via WhatsApp]\nSounds good",
        "[Asha sent via Email]\nSubject: Hello\nBody",
        "[Asha called using this talk track]\nTrack",
        "[Note from Asha]\nMet at a meetup",
        "[Asha's instruction]\nmake it shorter",
        "[Drafts offered via LinkedIn message, not sent]\n- One\n- Two",
      ].join("\n\n"),
    );
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...base,
      id: String(i),
      kind: "info" as const,
      text: `n${i}`,
    }));
    const out = transcript(many, "Priya");
    expect(out.split("\n\n")).toHaveLength(40);
    expect(out.startsWith("[Note from Asha]\nn5")).toBe(true);
  });
});

describe("prompt pieces (spec sections 5, 6 and 8)", () => {
  it("fills in the rep's name and title, or leaves the title out", () => {
    const withTitle = writingRulesFor("Somnath Chakraborty", "Co-founder");
    expect(withTitle).toContain("- Sender: Somnath Chakraborty, Co-founder at Lumor.");
    expect(withTitle).toContain('sign off "Somnath Chakraborty, Co-founder, Lumor · lumor.tech"');
    const without = writingRulesFor("Asha Rao", null);
    expect(without).toContain("- Sender: Asha Rao at Lumor.");
    expect(without).not.toContain("{rep");
    // The slot placeholders stay for the rep to fill in.
    expect(without).toContain("{slot 1} and {slot 2}");
  });

  it("uses the spec's task texts", () => {
    expect(taskText("first", "LinkedIn message")).toBe(
      "Draft the FIRST outreach message to this person on: LinkedIn message. If the channel is a LinkedIn message, assume they've just accepted the connection request.",
    );
    expect(taskText("ask", "Email", "make it shorter")).toBe(
      'Follow the rep\'s latest instruction ("make it shorter") and draft on: Email.',
    );
  });

  it("sends the input in the spec's order, with templates after the writing rules", async () => {
    await t.db.update(user).set({ jobTitle: "Account Executive" }).where(eq(user.id, rep.id));
    await setBrief(t.db, rep, personId, "Runs a 6-person research team; posts about panels.");
    await t.db.insert(template).values({
      name: "Message 1 · research leads",
      type: "Official",
      ownerId: admin.id,
      purpose: "Message 1",
      level: "Any",
      body: "Hi {Name}, how do you recruit?",
    });
    const items = await deskThread(t.db, rep, personId);
    const { input, refs } = await deskInput(
      t.db,
      rep,
      personId,
      "first",
      "LinkedIn message",
      null,
      items,
      null,
    );
    expect(Object.keys(input)).toEqual([
      "KNOWLEDGE BASE",
      "WRITING RULES",
      "DEMO BOOKING LINK",
      "STYLE REFERENCES",
      "PERSON",
      "CONVERSATION SO FAR",
      "TASK",
    ]);
    // The guardrails file is last in the knowledge base.
    expect(
      input["KNOWLEDGE BASE"].trim().endsWith(
        readSeedKnowledge()
          .find((f) => f.slug === "08-ai-guardrails")!
          .content.trim()
          .split("\n")
          .at(-1)!
          .trim(),
      ),
    ).toBe(true);
    expect(input["WRITING RULES"]).toContain("Asha Rao, Account Executive at Lumor");
    expect(input["DEMO BOOKING LINK"]).toBe("{calendar link}");
    expect(refs.map((r) => r.purpose)).toEqual(["Message 1"]);
    expect(input.PERSON).toMatchObject({
      name: "Priya Sharma",
      company: "Acme",
      role: "Head of Research",
      whoTheyAre: "Runs a 6-person research team; posts about panels.",
    });
  });

  it("picks the template purpose from where the conversation stands", () => {
    const sent = (n: number): DeskItem[] =>
      Array.from({ length: n }, (_, i) => ({
        id: String(i),
        at: NOW,
        who: null,
        kind: "sent",
        channel: "LinkedIn message",
        called: false,
        subject: null,
        text: "x",
        approach: null,
      }));
    expect(purposesFor("first", "LinkedIn InMail", [], null)).toEqual(["InMail", "Message 1"]);
    expect(purposesFor("next", "LinkedIn message", sent(1), null)).toEqual(["Follow-up 1"]);
    expect(purposesFor("next", "Email", sent(2), null)).toEqual(["Follow-up 2"]);
    expect(purposesFor("next", "Email", sent(5), null)).toEqual(["Break-up"]);
    expect(purposesFor("reply", "Email", [], "Interested")).toEqual(["Reply – interested"]);
    expect(purposesFor("reply", "Email", [], "Objection")).toEqual([]);
    expect(purposesFor("reply", "Email", [], null)).toHaveLength(4);
    expect(purposesFor("first", "Call", [], null)).toEqual([]);
  });
});

describe("output checker", () => {
  const opt = (text: string, subject = "") => [{ label: "A", subject, text }];
  it("catches banned phrases, claims and upcoming features", () => {
    const features = upcomingFeatureNames(
      readFileSync("docs/ai-knowledge/07-upcoming-features.md", "utf8"),
    );
    expect(features).toContain("Prototype testing");
    expect(features).toContain("Lumor Insights");
    expect(checkDraft(opt("Hi, a quick question about your panels?"), features)).toEqual([]);
    for (const phrase of [
      "proprietary",
      "just following up",
      "bumping",
      "circling back",
      "no lock-in",
      "unlimited teammates",
    ]) {
      expect(checkDraft(opt(`Hi, ${phrase} here`), features)).toEqual([`says "${phrase}"`]);
    }
    expect(checkDraft(opt("It's 5x faster"), features)).toEqual(["makes a speed or savings claim"]);
    expect(checkDraft(opt("Save 50% cheaper"), features)).toEqual([
      "makes a speed or savings claim",
    ]);
    expect(checkDraft(opt("Try Prototype testing soon"), features)).toEqual([
      "names an upcoming feature (Prototype testing)",
    ]);
    expect(checkDraft(opt("Body", "Proprietary data"), features)).toEqual(['says "proprietary"']);
  });

  it("reads the reply type at the start of the tip", () => {
    expect(replyTypeOf("Interested. They asked how it works.")).toBe("Interested");
    expect(replyTypeOf("Not interested. Close politely.")).toBe("Not interested");
    expect(replyTypeOf("Using a competitor: they use X.")).toBe("Using a competitor");
    expect(replyTypeOf("Two options below.")).toBeNull();
  });

  it("retries once, then saves the draft with a red warning naming the problem", async () => {
    // Make the stand-in's wording an "upcoming feature" so both tries fail.
    await t.db
      .update(knowledgeFile)
      .set({
        content: "# Upcoming\n\n| Feature | What |\n| --- | --- |\n| research platform | x |\n",
      })
      .where(eq(knowledgeFile.slug, "07-upcoming-features"));
    const d = await draftOnDesk(t.db, rep, personId, {
      task: "first",
      channel: "LinkedIn message",
    });
    expect(d.warning).toBe(
      "Check before sending: this draft names an upcoming feature (research platform).",
    );
  });
});

describe("drafting and the thread", () => {
  it("Initiate saves 2 options and a tip, audited without the text; credits the template", async () => {
    const [tpl] = await t.db
      .insert(template)
      .values({
        name: "M1",
        type: "Official",
        ownerId: admin.id,
        purpose: "Message 1",
        level: "Any",
        body: "Hi {Name}",
      })
      .returning();
    const d = await draftOnDesk(t.db, rep, personId, { task: "first", channel: "Email" });
    expect(d.options!).toHaveLength(2);
    expect(d.options![0].subject).toBe("A question about your research, Priya");
    expect(d.tip).toBeTruthy();
    expect(d.templateId).toBe(tpl.id);
    const [audit] = await t.db.select().from(auditLog).where(eq(auditLog.recordId, d.id));
    expect(audit.entityType).toBe("AI draft");
    expect(JSON.stringify(audit)).not.toContain(d.options![0].text);
    // Drafts never count as activities.
    expect(await t.db.select().from(activity).where(eq(activity.personId, personId))).toHaveLength(
      0,
    );
  });

  it("Ask AI saves the instruction first; Call drafts are talk tracks", async () => {
    await draftOnDesk(t.db, rep, personId, {
      task: "ask",
      channel: "Call",
      instruction: "make it shorter",
    });
    const items = await deskThread(t.db, rep, personId);
    expect(items.map((i) => i.kind)).toEqual(["ask", "draft"]);
    const draft = items[1] as Extract<DeskItem, { kind: "draft" }>;
    expect(draft.options[0].text).toMatch(/^Opening:/);
    expect(draft.options[0].subject).toBe("");
  });

  it("someone else's lead is refused", async () => {
    await expect(
      draftOnDesk(t.db, other, personId, { task: "first", channel: "Email" }),
    ).rejects.toThrow(PermissionError);
    await expect(setBrief(t.db, other, personId, "x")).rejects.toThrow(PermissionError);
  });

  it("old AI chats show only to their author", async () => {
    const [chat] = await t.db
      .insert(aiChat)
      .values({ personId, userId: rep.id, title: "Chat", createdBy: rep.id })
      .returning();
    await t.db.insert(aiChatMessage).values([
      { chatId: chat.id, role: "rep", content: "Help me reply", createdAt: NOW },
      {
        chatId: chat.id,
        role: "ai",
        content: "Here's a draft.",
        drafts: [{ approach: "Book", text: "Hi Priya" }],
        createdAt: new Date(NOW.getTime() + 1),
      },
    ]);
    const mine = await deskThread(t.db, rep, personId);
    expect(mine.map((i) => i.kind)).toEqual(["ask", "draft"]);
    expect(mine[1]).toMatchObject({ source: "chat", tip: "Here's a draft." });
    expect(await deskThread(t.db, admin, personId)).toHaveLength(0);
  });
});

describe("what the Desk logs (same activity types as before)", () => {
  it("Their reply: Reply received on the desk channel, pauses the plan; the AI's reply type is saved", async () => {
    await seedPlans(t.db, admin.id);
    const [outreach] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    await enrolPeople(t.db, rep, [personId], outreach.id, NOW);
    await addDeskReply(
      t.db,
      rep,
      personId,
      "WhatsApp",
      "Sounds interesting, how does it work?",
      NOW,
    );
    const [reply] = await t.db.select().from(activity).where(eq(activity.type, "Reply received"));
    expect(reply).toMatchObject({ channel: "WhatsApp", deskChannel: "WhatsApp", direction: "in" });
    const [e] = await t.db.select().from(planEnrolment).where(eq(planEnrolment.personId, personId));
    expect(e.status).toBe("Paused");
    await draftOnDesk(t.db, rep, personId, { task: "reply", channel: "WhatsApp" });
    const [after] = await t.db.select().from(activity).where(eq(activity.id, reply.id));
    expect(after.replyType).toBe("Interested");
  });

  it("Info about them: a Meeting note", async () => {
    await addDeskInfo(t.db, rep, personId, "LinkedIn message", "Spoke at a panel event", NOW);
    const [note] = await t.db.select().from(activity).where(eq(activity.personId, personId));
    expect([note.type, note.content]).toEqual(["Meeting note", "Spoke at a panel event"]);
  });

  it("Mark as sent: blocked by a placeholder; then Message sent with the draft, option and template", async () => {
    const [tpl] = await t.db
      .insert(template)
      .values({
        name: "M1",
        type: "Official",
        ownerId: admin.id,
        purpose: "Message 1",
        level: "Any",
        body: "Hi",
        version: "B",
      })
      .returning();
    const d = await draftOnDesk(t.db, rep, personId, {
      task: "first",
      channel: "LinkedIn message",
    });
    const second = d.options![1].text; // "…on {slot 1} or {slot 2}…"
    await expect(
      markDeskSent(
        t.db,
        rep,
        personId,
        { source: "desk", draftId: d.id, optionIndex: 1, text: second },
        NOW,
      ),
    ).rejects.toThrow("Fill in {slot 1} first.");
    const edited = second.replace("{slot 1}", "Tuesday 11am").replace("{slot 2}", "Wednesday 4pm");
    await markDeskSent(
      t.db,
      rep,
      personId,
      { source: "desk", draftId: d.id, optionIndex: 1, text: edited },
      NOW,
    );
    const [sent] = await t.db.select().from(activity).where(eq(activity.personId, personId));
    expect(sent).toMatchObject({
      type: "Message sent",
      channel: "LinkedIn",
      deskChannel: "LinkedIn message",
      direction: "out",
      content: edited,
      aiSuggestionUsed: true,
      suggestionApproach: "Demo slots",
      editLevel: "Heavy",
      fromDraftId: d.id,
      optionIndex: 1,
      templateId: tpl.id,
      templateVersion: "B",
    });
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.recordId, sent.id));
    expect(audits.length).toBeGreaterThan(0);
    const thread = await deskThread(t.db, rep, personId);
    expect(thread.find((i) => i.kind === "draft")).toMatchObject({ sent: [1] });
  });

  it("InMail keeps the subject; Mark as called logs a Call; a connection note logs Request sent with note", async () => {
    const inmail = await draftOnDesk(t.db, rep, personId, {
      task: "first",
      channel: "LinkedIn InMail",
    });
    await markDeskSent(
      t.db,
      rep,
      personId,
      {
        source: "desk",
        draftId: inmail.id,
        optionIndex: 0,
        text: inmail.options![0].text,
        subject: "Hello Priya",
      },
      NOW,
    );
    const call = await draftOnDesk(t.db, rep, personId, { task: "next", channel: "Call" });
    const track = call.options![1].text;
    await markDeskSent(
      t.db,
      rep,
      personId,
      { source: "desk", draftId: call.id, optionIndex: 1, text: track, override: true },
      NOW,
    );
    const note = await draftOnDesk(t.db, rep, personId, {
      task: "first",
      channel: "LinkedIn connection note",
    });
    await markDeskSent(
      t.db,
      rep,
      personId,
      {
        source: "desk",
        draftId: note.id,
        optionIndex: 0,
        text: note.options![0].text,
        override: true,
      },
      NOW,
    );
    const rows = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, personId)));
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    expect(byType["InMail sent"]).toMatchObject({ channel: "InMail", subject: "Hello Priya" });
    expect(byType.Call).toMatchObject({
      channel: "Call",
      callOutcome: "Connected",
      deskChannel: "Call",
      aiSuggestionUsed: true,
      fromDraftId: call.id,
      optionIndex: 1,
    });
    expect(byType["Request sent"]).toMatchObject({
      requestNote: true,
      deskChannel: "LinkedIn connection note",
      fromDraftId: note.id,
    });
    await expect(
      markDeskSent(
        t.db,
        other,
        personId,
        { source: "desk", draftId: note.id, optionIndex: 0, text: "x" },
        NOW,
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("Who they are and the rep's title are saved and audited", async () => {
    await setBrief(t.db, rep, personId, "Leads research");
    await setJobTitle(t.db, rep, "Account Executive");
    const [p] = await t.db.select().from(person).where(eq(person.id, personId));
    const [u] = await t.db.select().from(user).where(eq(user.id, rep.id));
    expect([p.brief, u.jobTitle]).toEqual(["Leads research", "Account Executive"]);
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.userId, rep.id));
    expect(entries.some((e) => e.entityType === "User")).toBe(true);
    expect(await t.db.select().from(deskEntry)).toHaveLength(0);
  });
});
