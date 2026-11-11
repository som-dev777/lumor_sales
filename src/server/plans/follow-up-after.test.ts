// D-060: each step's days are the follow-up after it; someone already contacted starts at the
// right step; a follow-up set on the person after they joined the plan goes ahead of its date.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, person, plan, planEnrolment } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson } from "../leads/people";
import { buildToday, classifyLead, nextFollowUpOf, type LeadFacts, type PlanFacts } from "../today";
import {
  completeStep,
  enrolPeople,
  liveEnrolment,
  logWithPlan,
  placeFromHistory,
  planState,
} from "./enrolment";
import { placeInPlan, type PastTouch } from "./placement";
import { checkPlan } from "./guardrails";
import { SEED_PLANS, seedPlans } from "./seed";

const on = (date: string) => new Date(`${date}T06:30:00Z`); // noon IST
const OUTREACH = SEED_PLANS[0].steps.map((s) => ({ channels: s.channels }));
const touch = (date: string, type: string, channel = "LinkedIn"): PastTouch => ({
  type,
  channel,
  date,
});

describe("placing someone on a plan from their history (pure)", () => {
  it("nothing logged: they start at step 1", () => {
    expect(placeInPlan(OUTREACH, [])).toMatchObject({ done: 0, waitingForAcceptance: false });
  });

  it("request, accepted and two messages: steps 1–3 done, step 4 next", () => {
    const place = placeInPlan(OUTREACH, [
      touch("2026-10-01", "Request sent"),
      touch("2026-10-02", "Request accepted"),
      touch("2026-10-03", "Message sent"),
      touch("2026-10-05", "Reply received"),
      touch("2026-10-08", "Message sent"),
    ]);
    expect(place).toMatchObject({
      done: 3,
      lastDoneDate: "2026-10-08",
      requestSentDate: "2026-10-01",
      acceptedDate: null, // only the request step's acceptance is used
      waitingForAcceptance: false,
    });
  });

  it("a request nobody accepted: waiting for acceptance", () => {
    expect(placeInPlan(OUTREACH, [touch("2026-10-01", "Request sent")])).toMatchObject({
      done: 1,
      waitingForAcceptance: true,
      requestSentDate: "2026-10-01",
    });
    expect(
      placeInPlan(OUTREACH, [
        touch("2026-10-01", "Request sent"),
        touch("2026-10-04", "Request accepted"),
      ]),
    ).toMatchObject({ done: 1, waitingForAcceptance: false, acceptedDate: "2026-10-04" });
  });

  it("a LinkedIn message with no request logged: already connected, so the request counts", () => {
    const place = placeInPlan(OUTREACH, [touch("2026-10-03", "Message sent")]);
    expect(place).toMatchObject({ done: 2, lastDoneDate: "2026-10-03" });
  });

  it("a step with options is done by any of them; a manual task needs a task done", () => {
    // Step 4: Call, Email or LinkedIn message. Three messages after the request cover 2–4.
    const place = placeInPlan(OUTREACH, [
      touch("2026-10-01", "Request accepted"),
      touch("2026-10-03", "Message sent"),
      touch("2026-10-07", "Message sent", "Email"),
      touch("2026-10-14", "Call", "Call"),
    ]);
    expect(place.done).toBe(4);
    const manual = [{ channels: [{ channel: "Manual task" as const, when: "always" as const }] }];
    expect(placeInPlan(manual, [touch("2026-10-01", "Message sent")]).done).toBe(0);
    expect(placeInPlan(manual, [touch("2026-10-01", "Task done")]).done).toBe(1);
  });
});

describe("the plan builder reads each step's follow-up", () => {
  it("guardrail 1 checks step 1's follow-up (the message after acceptance)", () => {
    const S = {
      msgAfterAcceptMinDays: 1,
      msgAfterAcceptMaxDays: 3,
      minGapDays: 3,
      maxFollowUps: 4,
      weeklyTouchLimit: 2,
      outreachMaxDays: 30,
    };
    const steps = (first: number) => [
      {
        channels: [{ channel: "LinkedIn connection request" as const, when: "always" as const }],
        waitDays: first,
      },
      {
        channels: [{ channel: "LinkedIn message" as const, when: "always" as const }],
        waitDays: 0,
      },
    ];
    expect(checkPlan("Outreach", steps(2), S).filter((f) => f.level === "block")).toEqual([]);
    expect(checkPlan("Outreach", steps(0), S).find((f) => f.rule === 1)).toMatchObject({
      step: 1,
      message: "Step 1: follow up 1–3 days after the connection is accepted, not 0.",
    });
  });
});

describe("plans on a database", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let rep: Actor;
  let outreachId: string;
  let n = 0;

  beforeEach(async () => {
    t = await createTestDb();
    const admin = (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id;
    rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
    await seedPlans(t.db, admin);
    const [row] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    outreachId = row.id;
  });
  afterEach(() => t.cleanup());

  async function lead() {
    n += 1;
    return createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: `Neha Plan${n}`,
        linkedinUrl: `linkedin.com/in/after-${n}`,
        companyName: "Acme",
        stage: "Contacted",
      }),
    );
  }
  const log = (personId: string, date: string, type: string, channel = "LinkedIn") =>
    t.db.insert(activity).values({
      personId,
      userId: rep.id,
      createdBy: rep.id,
      occurredAt: on(date),
      type: type as "Message sent",
      channel: channel as "LinkedIn",
      direction: type === "Reply received" ? "in" : "out",
    });
  const enrolment = async (id: string) => (await liveEnrolment(t.db, id))!;

  it("owner's example: step 2's 4-day follow-up makes step 3 due 4 days after step 2", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19")); // Mon
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 1, nextDueDate: "2026-10-19" });
    await completeStep(t.db, rep, p.id, {}, on("2026-10-19")); // request sent
    await logWithPlan(t.db, rep, p.id, { action: "accepted" }, { now: on("2026-10-20") });
    // Step 1's follow-up is 2 days: Message 1 is due Thu 22.
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 2, nextDueDate: "2026-10-22" });
    await completeStep(
      t.db,
      rep,
      p.id,
      { text: "Hi Neha, how do you run studies?" },
      on("2026-10-22"),
    );
    // Step 2's follow-up is 4 days: step 3 is due Mon 26.
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 3, nextDueDate: "2026-10-26" });
    const today = await buildToday(t.db, rep, on("2026-10-26"));
    expect(today.tasks.find((x) => x.personId === p.id)).toMatchObject({
      kind: "step",
      detail: "Step 3 of 5: LinkedIn message",
    });
    expect(
      (await buildToday(t.db, rep, on("2026-10-23"))).tasks.some((x) => x.personId === p.id),
    ).toBe(false);
  });

  it("after the last step, the plan finishes once its follow-up has passed", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await t.db
      .update(planEnrolment)
      .set({ currentStep: 5, nextDueDate: "2026-10-19" })
      .where(eq(planEnrolment.personId, p.id));
    await completeStep(t.db, rep, p.id, { text: "I'll leave it here, Neha." }, on("2026-10-19"));
    // The seed's Break-up has no follow-up: finished the same day.
    const state = await planState(t.db, p.id, "2026-10-19");
    expect(state).toMatchObject({ allDone: true, finished: true });
    // With a 3-day follow-up it would wait until the 22nd.
    await t.db
      .update(planEnrolment)
      .set({ nextDueDate: "2026-10-22" })
      .where(eq(planEnrolment.personId, p.id));
    expect(await planState(t.db, p.id, "2026-10-20")).toMatchObject({
      allDone: true,
      finished: false,
    });
    expect(await planState(t.db, p.id, "2026-10-22")).toMatchObject({ finished: true });
  });

  it("someone already contacted starts after what's logged, due from the last touch", async () => {
    const p = await lead();
    await log(p.id, "2026-10-12", "Request sent");
    await log(p.id, "2026-10-13", "Request accepted");
    await log(p.id, "2026-10-14", "Message sent");
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-16")); // Fri
    // Steps 1 and 2 done; Message 1 on the 14th + its 4-day follow-up = Sun 18 → Mon 19.
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 3,
      nextDueDate: "2026-10-19",
      waitingForAcceptance: false,
      endsBy: "2026-11-15",
    });
    const [event] = await t.db.select().from(activity).where(eq(activity.type, "Plan change"));
    expect(event.content).toBe(
      "Enrolled in Official Outreach (version 1) · starting at step 3 of 5: 2 steps were already done",
    );
  });

  it("an old history is due today, not in the past; a pending request waits for acceptance", async () => {
    const p = await lead();
    await log(p.id, "2026-09-01", "Request sent");
    await log(p.id, "2026-09-02", "Request accepted");
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-20"));
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 2, nextDueDate: "2026-10-20" });

    const q = await lead();
    await log(q.id, "2026-10-15", "Request sent");
    await enrolPeople(t.db, rep, [q.id], outreachId, on("2026-10-20"));
    expect(await enrolment(q.id)).toMatchObject({
      currentStep: 2,
      waitingForAcceptance: true,
      requestSentDate: "2026-10-15",
      nextDueDate: "2026-10-29", // the withdraw date, 14 days after the request
    });
  });

  it("Match step to history moves a plan that started at step 1", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await log(p.id, "2026-10-19", "Message sent");
    await log(p.id, "2026-10-20", "Message sent");
    const { enrolment: e } = await placeFromHistory(t.db, rep, p.id, on("2026-10-21"));
    // Connected already (a LinkedIn message), then Message 1 and Follow-up 1.
    expect(e).toMatchObject({ currentStep: 4 });
    expect(e.nextDueDate! >= "2026-10-21").toBe(true);
  });

  it("a follow-up set after joining the plan goes ahead of the plan's date, on My tasks too", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await completeStep(t.db, rep, p.id, {}, on("2026-10-19"));
    await logWithPlan(t.db, rep, p.id, { action: "accepted" }, { now: on("2026-10-19") });
    // The plan says Wed 21; the rep sets Fri 23.
    await t.db
      .update(person)
      .set({
        nextAction: "Send the case study",
        nextActionDate: "2026-10-23",
        nextActionSetAt: new Date(), // the real time, like the enrolment's,
      })
      .where(eq(person.id, p.id));
    expect(
      (await buildToday(t.db, rep, on("2026-10-21"))).tasks.some((x) => x.personId === p.id),
    ).toBe(false);
    expect(
      (await buildToday(t.db, rep, on("2026-10-23"))).tasks.find((x) => x.personId === p.id),
    ).toMatchObject({
      kind: "step",
      detail: "Step 2 of 5: LinkedIn message · your follow-up date: Send the case study",
    });
  });
});

describe("the next follow-up shown on a person (pure)", () => {
  const lead = (over: Partial<LeadFacts> = {}): LeadFacts => ({
    snoozedUntil: null,
    nextAction: null,
    nextActionDate: null,
    nextActionSetAt: null,
    awaitingReplyUntil: null,
    nudgeCount: 0,
    nurtureUntil: null,
    stage: "Connected",
    converted: false,
    createdAt: new Date("2026-10-01T06:30:00Z"),
    ...over,
  });
  const facts: PlanFacts = {
    status: "Active",
    finished: false,
    allDone: false,
    stepCount: 5,
    currentStep: 3,
    waitingForAcceptance: false,
    nextDueDate: "2026-10-26",
    requestSentDate: null,
    planType: "Outreach",
    planName: "Official Outreach",
    channel: "LinkedIn message",
    startedAt: new Date("2026-10-19T06:30:00Z"),
  };

  it("the plan's date when nothing is set on the person", () => {
    expect(nextFollowUpOf(lead(), undefined, facts)).toEqual({
      date: "2026-10-26",
      source: "plan",
      what: "Step 3 of 5: LinkedIn message",
      planDate: null,
    });
    expect(classifyLead(lead(), undefined, facts, "2026-10-26", "2026-09-01")).toMatchObject({
      kind: "step",
      due: "2026-10-26",
    });
  });

  it("a date set after joining wins until something is logged for it", () => {
    const own = lead({
      nextAction: "Call after their offsite",
      nextActionDate: "2026-10-28",
      nextActionSetAt: new Date("2026-10-22T06:30:00Z"),
    });
    expect(nextFollowUpOf(own, undefined, facts)).toEqual({
      date: "2026-10-28",
      source: "own",
      what: "Step 3 of 5: LinkedIn message · Call after their offsite",
      planDate: "2026-10-26",
    });
    expect(classifyLead(own, undefined, facts, "2026-10-26", "2026-09-01")).toBeNull();
    // Logged on the 28th: the plan's dates take over again.
    const last = {
      type: "Message sent",
      at: new Date("2026-10-28T06:30:00Z"),
      recordedAt: new Date("2026-10-28T06:30:00Z"),
    };
    expect(nextFollowUpOf(own, last, { ...facts, nextDueDate: "2026-11-02" })).toMatchObject({
      source: "plan",
      date: "2026-11-02",
    });
  });

  it("a date set before joining gives way to the plan", () => {
    const old = lead({
      nextActionDate: "2026-10-20",
      nextActionSetAt: new Date("2026-10-10T06:30:00Z"),
    });
    expect(nextFollowUpOf(old, undefined, facts)).toMatchObject({ source: "plan" });
  });
});
