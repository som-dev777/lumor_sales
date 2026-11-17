// F30 outreach sprints (D-065): Add many, who's next and the limits, Sent ✓ through the plan, the
// note's 300-character limit and placeholders, the follow-up sprint, Accepted and Not a fit.
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activity,
  auditLog,
  company,
  person,
  persona,
  plan,
  planEnrolment,
  playbookSettings,
} from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { seedKnowledge } from "./knowledge";
import { readSeedKnowledge } from "./knowledge-files";
import { addMany, nameFromLink, parseBulk } from "./leads/bulk-add";
import { createPerson } from "./leads/people";
import { addEntry } from "./conversation";
import { enrolPeople, liveEnrolment } from "./plans/enrolment";
import { seedPlans } from "./plans/seed";
import {
  checkSprintText,
  connectionQueue,
  draftFor,
  followUpQueue,
  NOTE_MAX,
  sprintAccepted,
  sprintLimits,
  sprintNotAFit,
  sprintSent,
} from "./sprint";

const NOW = new Date("2026-11-18T06:30:00Z"); // Wednesday, noon IST

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let n = 0;

beforeEach(async () => {
  t = await createTestDb();
  const admin = (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id;
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  await seedPlans(t.db, admin);
  await seedKnowledge(t.db, readSeedKnowledge());
  vi.stubEnv("AI_FAKE", "1");
  vi.stubEnv("DATABASE_URL", "file:test.db");
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

async function lead(extra: Record<string, unknown> = {}) {
  n += 1;
  return createPerson(
    t.db,
    rep,
    personSchema.parse({
      fullName: `Meera Sprint${n}`,
      linkedinUrl: `linkedin.com/in/sprint-${n}`,
      companyName: `Sprint Co ${n}`,
      stage: "Prospect",
      ...extra,
    }),
  );
}

async function personaOf(tier: 1 | 2 | 3) {
  const [row] = await t.db
    .insert(persona)
    .values({ name: `Tier ${tier} persona`, type: "Official", ownerId: rep.id, tier })
    .returning();
  return row.id;
}

describe("Add many (F30)", () => {
  it("reads pasted lines, a CSV with a header, and names from profile links", () => {
    expect(
      parseBulk("linkedin.com/in/a-b, Anil Bose, CTO, Acme\nhttps://in.linkedin.com/in/c-d\t\t\t"),
    ).toMatchObject([
      { line: 1, link: "linkedin.com/in/a-b", name: "Anil Bose", title: "CTO", company: "Acme" },
      { line: 2, link: "https://in.linkedin.com/in/c-d", name: null },
    ]);
    expect(
      parseBulk(
        'Name,Title,Company,Profile URL\n"Rao, Asha",Head of Insights,Beta,linkedin.com/in/asha',
      ),
    ).toMatchObject([
      {
        line: 2,
        link: "linkedin.com/in/asha",
        name: "Rao, Asha",
        title: "Head of Insights",
        company: "Beta",
      },
    ]);
    expect(nameFromLink("https://www.linkedin.com/in/priya-sharma-1a2b3c/")).toBe("Priya Sharma");
    expect(nameFromLink("linkedin.com/in/12345")).toBeNull();
  });

  it("adds each line like Add person, matches companies and lists what it skipped", async () => {
    await lead({ linkedinUrl: "linkedin.com/in/already-here" });
    const r = await addMany(
      t.db,
      rep,
      [
        "linkedin.com/in/priya-sharma-9x, , Head of Research, Acme Insights",
        "linkedin.com/in/rahul-mehta, Rahul Mehta, CTO",
        "https://www.linkedin.com/in/already-here/",
        "not a link at all",
        "linkedin.com/sales/lead/ACwAAB123,Kiran Das,VP,Acme Insights",
      ].join("\n"),
      { companyName: "Acme Insights" },
    );
    expect(r.added.map((a) => a.name)).toEqual(["Priya Sharma", "Rahul Mehta"]);
    expect(r.skipped).toEqual([
      expect.objectContaining({ line: 3, reason: "Already added by Asha Rao." }),
      expect.objectContaining({ line: 4, reason: "No LinkedIn link on this line." }),
      expect.objectContaining({
        line: 5,
        reason: expect.stringContaining("Copy LinkedIn.com URL"),
      }),
    ]);
    // One company for both; one audit entry per person.
    const acme = await t.db.select().from(company).where(eq(company.name, "Acme Insights"));
    expect(acme).toHaveLength(1);
    const rahul = (await t.db.select().from(person).where(eq(person.fullName, "Rahul Mehta")))[0];
    expect(rahul).toMatchObject({ companyId: acme[0].id, stage: "Prospect", ownerId: rep.id });
    const audits = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "Person"), eq(auditLog.action, "Created")));
    expect(audits.length).toBe(3); // the earlier lead + 2
  });

  it("needs a company and refuses more than 50 lines", async () => {
    const r = await addMany(t.db, rep, "linkedin.com/in/no-company-person");
    expect(r.skipped[0].reason).toContain("No company");
    const many = Array.from({ length: 51 }, (_, i) => `linkedin.com/in/p-${i}`).join("\n");
    await expect(addMany(t.db, rep, many, { companyName: "X" })).rejects.toThrow("Up to 50");
  });
});

describe("connection sprint (F30)", () => {
  it("offers people never contacted, Tier 1 first, up to today's target", async () => {
    const t1 = await personaOf(1);
    const t3 = await personaOf(3);
    const noPersona = await lead();
    const tier3 = await lead({ personaId: t3 });
    const tier1 = await lead({ personaId: t1 });
    const contacted = await lead();
    await t.db.insert(activity).values({
      personId: contacted.id,
      userId: rep.id,
      createdBy: rep.id,
      occurredAt: new Date("2026-11-10T06:30:00Z"),
      type: "Message sent",
      channel: "LinkedIn",
    });
    await lead({ doNotContact: true, dncReason: "Asked" });

    const { cards, limits } = await connectionQueue(t.db, rep, {}, NOW);
    expect(cards.map((c) => c.personId)).toEqual([tier1.id, tier3.id, noPersona.id]);
    expect(limits).toMatchObject({ dailyTarget: 20, weeklyLimit: 100, sentToday: 0, left: 20 });
    expect(cards[0]).toMatchObject({
      kind: "connect",
      channel: "LinkedIn connection note",
      tier: 1,
      profileUrl: expect.stringContaining("https://linkedin.com/in/"),
    });
    // Filter by persona; and a target of 1 gives one card.
    expect((await connectionQueue(t.db, rep, { personaId: t3 }, NOW)).cards).toHaveLength(1);
    await t.db.update(playbookSettings).set({ dailyConnectionTarget: 1 });
    expect((await connectionQueue(t.db, rep, {}, NOW)).cards.map((c) => c.personId)).toEqual([
      tier1.id,
    ]);
  });

  it("Sent ✓ puts them on Official Outreach, logs the request with the note, and waits", async () => {
    const p = await lead();
    const draft = await draftFor(t.db, rep, p.id, "connect", "LinkedIn connection note");
    expect(draft.options.length).toBeGreaterThan(0);
    // The same unsent draft is reused.
    expect((await draftFor(t.db, rep, p.id, "connect", "LinkedIn connection note")).id).toBe(
      draft.id,
    );
    const note = "Hi Meera, I work on survey research at Lumor. Would be glad to connect.";
    await sprintSent(
      t.db,
      rep,
      p.id,
      { kind: "connect", text: note, draftId: draft.id, optionIndex: 0 },
      NOW,
    );
    const e = await liveEnrolment(t.db, p.id);
    expect(e).toMatchObject({ status: "Active", waitingForAcceptance: true, currentStep: 2 });
    const [req] = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, p.id), eq(activity.type, "Request sent")));
    expect(req).toMatchObject({
      content: note,
      requestNote: true,
      planEnrolmentId: e!.id,
      fromDraftId: draft.id,
      deskChannel: "LinkedIn connection note",
      aiSuggestionUsed: true,
    });
    expect((await sprintLimits(t.db, rep, NOW)).sentToday).toBe(1);
    // They're no longer in the connection sprint; they're waiting in the follow-up sprint.
    expect((await connectionQueue(t.db, rep, {}, NOW)).cards).toHaveLength(0);
    const follow = await followUpQueue(t.db, rep, NOW);
    expect(follow.waiting.map((w) => w.personId)).toEqual([p.id]);
  });

  it("refuses a note over 300 characters, a placeholder, and the week's limit", async () => {
    expect(() => checkSprintText("connect", "x".repeat(NOTE_MAX + 1))).toThrow(
      "300 characters at most. This one is 301.",
    );
    expect(() => checkSprintText("connect", "Hi {first name}")).toThrow("Fill in {first name}");
    expect(() => checkSprintText("next", "y".repeat(400))).not.toThrow();
    await t.db.update(playbookSettings).set({ dailyConnectionTarget: 1 }); // weekly limit 5
    const past = [];
    for (let i = 0; i < 5; i++) past.push(await lead());
    for (const p of past) {
      await t.db.insert(activity).values({
        personId: p.id,
        userId: rep.id,
        createdBy: rep.id,
        occurredAt: new Date("2026-11-16T06:30:00Z"), // Monday this week
        type: "Request sent",
        channel: "LinkedIn",
      });
    }
    const p = await lead();
    expect((await connectionQueue(t.db, rep, {}, NOW)).limits.left).toBe(0);
    await expect(
      sprintSent(t.db, rep, p.id, { kind: "connect", text: "Hi Meera, glad to connect." }, NOW),
    ).rejects.toThrow("the limit of 5");
  });

  it("Not a fit stops the plan and marks them Lost (Wrong person)", async () => {
    const p = await lead();
    const [official] = await t.db.select().from(planEnrolment);
    expect(official).toBeUndefined();
    const [official2] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    await enrolPeople(t.db, rep, [p.id], official2.id, NOW);
    await sprintNotAFit(t.db, rep, p.id, NOW);
    expect((await t.db.select().from(person).where(eq(person.id, p.id)))[0]).toMatchObject({
      stage: "Lost",
      lostReason: "Wrong person",
    });
    expect(await liveEnrolment(t.db, p.id)).toBeFalsy();
  });
});

describe("follow-up sprint (F30)", () => {
  it("Accepted moves the plan; the message step then shows, and Sent ✓ does the step", async () => {
    const p = await lead();
    await sprintSent(
      t.db,
      rep,
      p.id,
      { kind: "connect", text: "Hi Meera, glad to connect." },
      new Date("2026-11-16T06:30:00Z"),
    );
    await sprintAccepted(t.db, rep, p.id, new Date("2026-11-16T07:30:00Z"));
    const e = await liveEnrolment(t.db, p.id);
    expect(e).toMatchObject({ waitingForAcceptance: false, acceptedDate: "2026-11-16" });
    const due = e!.nextDueDate!;
    const day = new Date(`${due}T06:30:00Z`);
    const { waiting, cards } = await followUpQueue(t.db, rep, day);
    expect(waiting).toHaveLength(0);
    expect(cards).toMatchObject([
      {
        personId: p.id,
        kind: "first",
        channel: "LinkedIn message",
        label: "Step 2 of 5: LinkedIn message",
      },
    ]);
    const draft = await draftFor(t.db, rep, p.id, "first", "LinkedIn message");
    await expect(
      sprintSent(t.db, rep, p.id, { kind: "first", text: "Hi {slot 1}", draftId: draft.id }, day),
    ).rejects.toThrow("Fill in {slot 1}");
    await sprintSent(
      t.db,
      rep,
      p.id,
      { kind: "first", text: "Hi Meera, how do you run your studies?", draftId: draft.id },
      day,
    );
    const after = await liveEnrolment(t.db, p.id);
    expect(after!.currentStep).toBe(3);
    expect(after!.nextDueDate! > due).toBe(true);
    expect((await followUpQueue(t.db, rep, day)).cards).toHaveLength(0);
  });

  it("an Interested reply not answered yet is a Book the demo card", async () => {
    const p = await lead({ stage: "Contacted" });
    const at = new Date("2026-11-17T06:30:00Z");
    const entry = (from: "me" | "them", text: string, replyType: "Interested" | null = null) =>
      addEntry(
        t.db,
        rep,
        p.id,
        { from, channel: "LinkedIn", at, text, replyType, replyBy: null, followUpDate: null },
        { now: at },
      );
    await entry("me", "Hi Meera, how do you run studies?");
    await entry("them", "Sounds interesting, tell me more.", "Interested");
    const { cards } = await followUpQueue(t.db, rep, NOW);
    expect(cards).toMatchObject([
      {
        personId: p.id,
        kind: "reply",
        label: "Book the demo",
        theySaid: expect.stringContaining("Sounds interesting"),
      },
    ]);
    const draft = await draftFor(t.db, rep, p.id, "reply", "LinkedIn message");
    await sprintSent(
      t.db,
      rep,
      p.id,
      {
        kind: "reply",
        text: "Thanks Meera! Pick a time here: https://lumor.tech/demo",
        draftId: draft.id,
        optionIndex: 1,
      },
      NOW,
    );
    expect((await followUpQueue(t.db, rep, NOW)).cards).toHaveLength(0);
  });

  it("a plan message is refused when no message step is due", async () => {
    const p = await lead();
    await expect(
      sprintSent(t.db, rep, p.id, { kind: "next", text: "Hello again" }, NOW),
    ).rejects.toThrow("no message step due");
  });
});
