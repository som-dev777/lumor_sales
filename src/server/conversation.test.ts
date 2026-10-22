// The conversation thread (F18, D-038): who, where and when for every message, and what each
// entry does to the plan, the reply-by date and Today.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, person, plan, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { entrySchema } from "@/lib/validation/conversation";
import {
  addEntries,
  addEntry,
  computeSituation,
  isDuplicate,
  sideOf,
  threadOf,
  type ThreadEntry,
} from "./conversation";
import { createPerson } from "./leads/people";
import {
  completeStep,
  enrolPeople,
  GuardrailWarning,
  liveEnrolment,
  logWithPlan,
  touchHistory,
} from "./plans/enrolment";
import { seedPlans } from "./plans/seed";
import { buildTeam, buildToday } from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let personId: string;

// Noon IST on a date. Mon 19 Oct 2026 … Fri 23 Oct.
const on = (date: string, time = "06:30") => new Date(`${date}T${time}:00Z`);
const NOW = on("2026-10-21");

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  const p = await createPerson(
    t.db,
    rep,
    personSchema.parse({
      fullName: "Priya Sharma",
      linkedinUrl: "linkedin.com/in/priya-thread",
      companyName: "Acme",
      stage: "Connected",
    }),
  );
  personId = p.id;
});
afterEach(() => t.cleanup());

const entry = (
  from: ThreadEntry["from"],
  at: Date,
  extra: Partial<ThreadEntry> = {},
): ThreadEntry => ({
  from,
  at,
  channel: "LinkedIn",
  text: `${from} at ${at.toISOString()}`,
  ...extra,
});
const add = (e: ThreadEntry, actor = rep, now = NOW, opts = {}) =>
  addEntry(t.db, actor, personId, e, { now, ...opts });
const personRow = async () => (await t.db.select().from(person).where(eq(person.id, personId)))[0];

describe("the thread", () => {
  it("puts each entry on its side, oldest first, with its channel and time", async () => {
    await add(entry("me", on("2026-10-19"), { text: "Hi Priya" }));
    await add(entry("them", on("2026-10-20"), { channel: "Email", text: "Thanks!" }));
    await add(entry("note", on("2026-10-20", "08:00"), { channel: "In person", text: "Met" }));
    await add(entry("me", on("2026-10-21", "05:00"), { channel: "In person", text: "Demoed" }));
    await add(entry("me", on("2026-10-21", "06:00"), { channel: "Call", text: "Agreed a trial" }));
    const items = await threadOf(t.db, personId);
    const conversation = items.filter((i) => i.side !== "event");
    expect(conversation.map((i) => [i.side, i.type, i.channel, i.content])).toEqual([
      ["me", "Message sent", "LinkedIn", "Hi Priya"],
      ["them", "Reply received", "Email", "Thanks!"],
      ["note", "Meeting note", "In person", "Met"],
      ["me", "Meeting note", "In person", "Demoed"],
      ["me", "Call", "Call", "Connected — Agreed a trial"],
    ]);
    expect(conversation[0].at).toEqual(on("2026-10-19"));
    // Stage changes and plan events sit behind "Show plan and stage events".
    expect(sideOf({ direction: null, type: "Plan change" })).toBe("event");
  });

  it("a reply moves the stage to Replied; messages and calls are touches; in person isn't", async () => {
    await add(entry("me", on("2026-10-19")));
    await add(entry("me", on("2026-10-19", "08:00"), { channel: "In person" }));
    await add(entry("them", on("2026-10-20")));
    expect(await personRow()).toMatchObject({ stage: "Replied", nextAction: "Respond" });
    expect((await touchHistory(t.db, personId)).map((h) => h.kind)).toEqual(["message", "reply"]);
  });

  it("refuses future times, Do not contact for messages, and other reps' leads", async () => {
    await expect(add(entry("me", on("2026-10-22")))).rejects.toThrow(
      "The time can't be in the future.",
    );
    await expect(add(entry("them", on("2026-10-20")), other)).rejects.toThrow(PermissionError);
    // Anyone can add a note.
    await add(entry("note", on("2026-10-20")), other);
    await t.db.update(person).set({ doNotContact: true }).where(eq(person.id, personId));
    await expect(add(entry("me", on("2026-10-20")))).rejects.toThrow("Do not contact");
    await expect(add(entry("me", on("2026-10-20"), { channel: "In person" }))).rejects.toThrow(
      "Do not contact",
    );
  });

  it("writes an audit entry for every entry", async () => {
    const before = (await t.db.select().from(auditLog)).length;
    await add(entry("note", on("2026-10-20"), { channel: "WhatsApp" }));
    await add(entry("me", on("2026-10-20"), { channel: "In person" }));
    const rows = (await t.db.select().from(auditLog)).slice(before);
    expect(rows.map((r) => r.recordName)).toEqual([
      "Note on Priya Sharma",
      "Meeting with Priya Sharma",
    ]);
  });

  it("validates the form: a real IST date and time, a channel and some text", () => {
    const ok = entrySchema.parse({
      from: "them",
      channel: "Email",
      at: "2026-10-20T18:05",
      text: " Thanks ",
      replyType: "",
    });
    expect(ok).toMatchObject({ text: "Thanks", replyType: null });
    expect(ok.at.toISOString()).toBe("2026-10-20T12:35:00.000Z");
    expect(entrySchema.safeParse({ ...ok, at: "yesterday" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...ok, at: "2026-10-20T18:05", channel: "Fax" }).success).toBe(
      false,
    );
  });
});

describe("guardrails and earlier dates (re-plan quietly, D-038)", () => {
  it("a message today gets the usual warnings; the same message dated earlier doesn't", async () => {
    await add(entry("me", on("2026-10-20")));
    await expect(add(entry("me", on("2026-10-21", "05:00")))).rejects.toThrow(GuardrailWarning);
    await add(entry("me", on("2026-10-21", "05:00")), rep, NOW, { override: true });
    // Two days ago, logged now: history, no warning.
    await add(entry("me", on("2026-10-19")));
    expect((await touchHistory(t.db, personId)).filter((h) => h.kind === "message")).toHaveLength(
      3,
    );
  });
});

describe("plans (F17 + F18)", () => {
  let outreachId: string;
  beforeEach(async () => {
    await t.db.insert(template).values({
      name: "M1",
      type: "Official",
      ownerId: admin.id,
      purpose: "Message 1",
      level: "Any",
      body: "Hi {Name}",
    });
    await seedPlans(t.db, admin.id);
    const [row] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    outreachId = row.id;
    await enrolPeople(t.db, rep, [personId], outreachId, on("2026-10-12"));
    await completeStep(t.db, rep, personId, {}, on("2026-10-12")); // connection request
    await logWithPlan(t.db, rep, personId, { action: "accepted" }, { now: on("2026-10-13") });
  });

  it("'Yes, step N' does the step at the entry's real time and schedules from that date", async () => {
    // Message 1 was sent on Thu 15 Oct but logged on Wed 21: Follow-up 1 is due 15 + 4 = 19 Oct.
    await add(
      entry("me", on("2026-10-15"), { text: "Hi Priya, how does Acme run research?" }),
      rep,
      NOW,
      {
        asStep: true,
      },
    );
    expect(await liveEnrolment(t.db, personId)).toMatchObject({
      currentStep: 3,
      nextDueDate: "2026-10-19",
    });
    const [sent] = (await threadOf(t.db, personId)).filter((i) => i.type === "Message sent");
    expect(sent).toMatchObject({ planStepOrder: 2, at: on("2026-10-15") });
  });

  it("a reply pauses the plan from the reply's time, even when it's logged later", async () => {
    await add(entry("them", on("2026-10-16")));
    expect(await liveEnrolment(t.db, personId)).toMatchObject({
      status: "Paused",
      pausedAt: on("2026-10-16"),
    });
  });

  it("a pasted conversation is history: no step question, no warnings; a reply pauses", async () => {
    const n = await addEntries(
      t.db,
      rep,
      personId,
      [
        entry("them", on("2026-10-17"), { text: "Sounds good" }),
        entry("me", on("2026-10-15"), { text: "Hi Priya" }),
        entry("me", on("2026-10-16"), { text: "One more thing" }),
      ],
      NOW,
    );
    expect(n).toBe(3);
    const e = await liveEnrolment(t.db, personId);
    expect(e).toMatchObject({ status: "Paused", currentStep: 2, pausedAt: on("2026-10-17") });
    const msgs = (await threadOf(t.db, personId)).filter((i) => i.side !== "event");
    expect(msgs.map((i) => i.content)).toEqual(["Hi Priya", "One more thing", "Sounds good"]);
  });
});

describe("reply-by dates (F18)", () => {
  it("a message from me can set the date, within the Playbook Settings bounds", async () => {
    await expect(add(entry("me", on("2026-10-21"), { replyBy: "2026-11-05" }))).rejects.toThrow(
      "Pick a reply-by date 1–10 days after the message.",
    );
    await add(entry("me", on("2026-10-21"), { replyBy: "2026-10-23" }));
    expect((await personRow()).awaitingReplyUntil).toBe("2026-10-23");
    // An earlier message doesn't replace what the rep is waiting for now.
    await add(entry("me", on("2026-10-19"), { replyBy: "2026-10-20" }));
    expect((await personRow()).awaitingReplyUntil).toBe("2026-10-23");
  });

  it("Today shows a nudge task once the date passes, then close the loop after 2 nudges", async () => {
    await add(entry("me", on("2026-10-21"), { replyBy: "2026-10-23" }));
    const taskOn = async (date: string) =>
      (await buildToday(t.db, rep, on(date))).tasks.find((x) => x.section === "deadline");
    expect(await taskOn("2026-10-23")).toBeUndefined();
    expect(await taskOn("2026-10-24")).toMatchObject({
      kind: "nudge",
      detail: "Expected a reply by 23 Oct 2026 · nudge 1 of 2",
    });
    await t.db.update(person).set({ nudgeCount: 2 }).where(eq(person.id, personId));
    expect((await taskOn("2026-10-24"))?.detail).toBe(
      "No reply after 2 nudges (expected by 23 Oct 2026). Close the loop politely.",
    );
    // Their reply ends it.
    await add(entry("them", on("2026-10-24")), rep, on("2026-10-24"));
    expect(await taskOn("2026-10-25")).toBeUndefined();
  });
});

describe("what to do next (the app decides the situation)", () => {
  const base = {
    awaitingReplyUntil: null,
    nudgeCount: 0,
    planNextDue: null,
    today: "2026-10-21",
    minGapDays: 3,
  };
  const msg = (direction: "out" | "in", date: string) => ({
    id: "a1",
    direction,
    at: on(date),
    channel: "LinkedIn",
  });

  it("start, reply, wait, nudge and close", () => {
    expect(computeSituation({ ...base, last: null }).kind).toBe("start");
    expect(computeSituation({ ...base, last: msg("in", "2026-10-01") })).toMatchObject({
      kind: "reply",
      replyId: "a1",
      lastFrom: "them",
    });
    // No reply-by date: wait the minimum gap after the rep's message.
    expect(computeSituation({ ...base, last: msg("out", "2026-10-19") })).toMatchObject({
      kind: "wait",
      until: "2026-10-22",
    });
    expect(computeSituation({ ...base, last: msg("out", "2026-10-17") }).kind).toBe("nudge");
    // The reply-by date wins, then the plan's next step.
    expect(
      computeSituation({
        ...base,
        last: msg("out", "2026-10-10"),
        awaitingReplyUntil: "2026-10-21",
      }).kind,
    ).toBe("wait");
    expect(
      computeSituation({ ...base, last: msg("out", "2026-10-10"), planNextDue: "2026-10-23" }),
    ).toMatchObject({ kind: "wait", until: "2026-10-23" });
    expect(
      computeSituation({
        ...base,
        last: msg("out", "2026-10-10"),
        awaitingReplyUntil: "2026-10-20",
        nudgeCount: 2,
      }).kind,
    ).toBe("close");
  });

  it("spots pasted messages already in the thread (same side, same words)", () => {
    const items = [{ side: "me" as const, content: "Hi  Priya,\nloved your post." }];
    expect(isDuplicate(items, "me", "hi priya, loved your post.")).toBe(true);
    expect(isDuplicate(items, "them", "hi priya, loved your post.")).toBe(false);
    expect(isDuplicate(items, "me", "Something else")).toBe(false);
  });
});

describe("Team tab (F08, R8)", () => {
  it("per person: due today, overdue, done today, on plans, replies waiting; Admins only", async () => {
    await add(entry("me", on("2026-10-21", "04:00")));
    await add(entry("them", on("2026-10-18")), rep, NOW, {});
    // The reply is older than the message, so it's answered: nothing waiting.
    let rows = await buildTeam(t.db, admin, NOW);
    expect(rows.find((r) => r.name === "Asha")).toMatchObject({
      doneToday: 1,
      repliesWaiting: 0,
      inPlans: 0,
    });
    await add(entry("them", on("2026-10-21", "05:00")), rep, on("2026-10-23"));
    rows = await buildTeam(t.db, admin, on("2026-10-23"));
    expect(rows.find((r) => r.name === "Asha")).toMatchObject({ repliesWaiting: 1, dueToday: 1 });
    expect(rows.map((r) => r.name)).toEqual(["Asha", "Ravi", "Somnath"]);
    await expect(buildTeam(t.db, rep, NOW)).rejects.toThrow(PermissionError);
  });
});
