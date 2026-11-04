import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, person, persona, plan, planEnrolment, template } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { planSchema } from "@/lib/validation/plans";
import { createPerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import { completeStep, enrolPeople, liveEnrolment } from "./plans/enrolment";
import { createPlan, updatePlan } from "./plans/plans";
import { seedPlans } from "./plans/seed";
import {
  applyRanking,
  backlogByPerson,
  backlogOf,
  buildToday,
  completeTask,
  setFollowUp,
  snoozeLead,
} from "./today";
import { snoozeStep } from "./plans/enrolment";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let outreachId: string;
const on = (date: string) => new Date(`${date}T06:30:00Z`);
// "Today" is Friday 30 Oct 2026.
const NOW = on("2026-10-30");

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
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
});
afterEach(() => t.cleanup());

let n = 0;
async function lead(name: string, extra: Record<string, unknown> = {}, owner = rep) {
  n += 1;
  return createPerson(
    t.db,
    owner,
    personSchema.parse({
      companyName: "Acme",
      fullName: name,
      linkedinUrl: `linkedin.com/in/today-${n}`,
      stage: "Prospect",
      ...extra,
    }),
  );
}
const sections = async () =>
  (await buildToday(t.db, rep, NOW)).tasks.map((x) => [x.section, x.name]);

describe("Today v2 sections (F08)", () => {
  it("builds every section in the PRD order, one task per lead", async () => {
    const reply = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      reply.id,
      { action: "gotReply", replyType: "Interested" },
      { now: on("2026-10-29") },
    );
    const meeting = await lead("Meeting Lead");
    await quickLog(
      t.db,
      rep,
      meeting.id,
      { action: "meetingBooked", meetingDate: "2026-10-30" },
      { now: on("2026-10-20") },
    );
    const deadline = await lead("Deadline Lead");
    await t.db
      .update(person)
      .set({ awaitingReplyUntil: "2026-10-28" })
      .where(eq(person.id, deadline.id));
    const dueToday = await lead("Due Lead");
    await enrolPeople(t.db, rep, [dueToday.id], outreachId, NOW);
    const overdue = await lead("Overdue Lead");
    await enrolPeople(t.db, rep, [overdue.id], outreachId, on("2026-10-27"));
    const withdraw = await lead("Withdraw Lead");
    await enrolPeople(t.db, rep, [withdraw.id], outreachId, on("2026-10-15"));
    await completeStep(t.db, rep, withdraw.id, {}, on("2026-10-15"));
    const finished = await lead("Finished Lead");
    await enrolPeople(t.db, rep, [finished.id], outreachId, on("2026-10-01"));
    const fe = (await liveEnrolment(t.db, finished.id))!;
    await t.db
      .update(planEnrolment)
      .set({ currentStep: 6, nextDueDate: null })
      .where(eq(planEnrolment.id, fe.id));
    const nurture = await lead("Nurture Lead");
    await t.db.update(person).set({ nurtureUntil: "2026-10-29" }).where(eq(person.id, nurture.id));
    const stale = await lead("Stale Lead");
    await t.db.insert(activity).values({
      personId: stale.id,
      userId: rep.id,
      occurredAt: on("2026-10-01"),
      type: "Message sent",
    });
    await lead("Do Not Contact", { doNotContact: true, dncReason: "Asked us to stop" });
    await lead("Someone Else's", {}, other);

    // Anything due on an earlier day is a Backlog task, most days late first (D-043).
    expect(await sections()).toEqual([
      ["backlog", "Overdue Lead"],
      ["backlog", "Deadline Lead"],
      ["backlog", "Reply Lead"],
      ["backlog", "Withdraw Lead"],
      ["meeting", "Meeting Lead"],
      ["due", "Due Lead"],
      ["finished", "Finished Lead"],
      ["nurture", "Nurture Lead"],
      ["stale", "Stale Lead"],
    ]);
    const plan = await buildToday(t.db, rep, NOW);
    const late = (name: string) => plan.tasks.find((x) => x.name === name)!;
    expect(late("Overdue Lead")).toMatchObject({
      origin: "due",
      daysLate: 3,
      dueDate: "2026-10-27",
    });
    expect(late("Overdue Lead").detail).toContain("due 27 Oct 2026 · 3 days late");
    expect(late("Reply Lead")).toMatchObject({ origin: "reply", daysLate: 1, kind: "quick" });
    expect(late("Deadline Lead")).toMatchObject({ origin: "deadline", dueDate: "2026-10-29" });
    // The People and Companies badges use the same rules.
    const badges = await backlogByPerson(t.db, NOW);
    expect([...badges.keys()].sort()).toEqual(
      plan.tasks
        .filter((x) => x.section === "backlog")
        .map((x) => x.personId)
        .sort(),
    );
    expect(await backlogOf(t.db, reply.id, NOW)).toMatchObject({ daysLate: 1 });
    expect(await backlogOf(t.db, dueToday.id, NOW)).toBeNull();
    const due = (await buildToday(t.db, rep, NOW)).tasks.find((x) => x.name === "Due Lead")!;
    expect(due).toMatchObject({
      kind: "step",
      channel: "LinkedIn connection request",
      planName: "Official Outreach",
    });
    const withdrawTask = (await buildToday(t.db, rep, NOW)).tasks.find(
      (x) => x.name === "Withdraw Lead",
    )!;
    expect(withdrawTask.kind).toBe("withdraw");
  });

  it("Trial plan steps go to Trial check-ins; paused plans and future steps don't show", async () => {
    const { plan: trial } = await createPlan(
      t.db,
      rep,
      planSchema.parse({
        name: "My trial",
        planType: "Trial",
        type: "Personal",
        steps: [
          {
            channels: [{ channel: "Manual task", when: "always" }],
            waitDays: 0,
            script: "Check setup",
          },
        ],
      }),
    );
    const a = await lead("Trial Lead", { stage: "Trial" });
    await enrolPeople(t.db, rep, [a.id], trial.id, NOW);
    const b = await lead("Paused Lead");
    await enrolPeople(t.db, rep, [b.id], outreachId, NOW);
    const be = (await liveEnrolment(t.db, b.id))!;
    await t.db.update(planEnrolment).set({ status: "Paused" }).where(eq(planEnrolment.id, be.id));
    const c = await lead("Future Lead");
    await enrolPeople(t.db, rep, [c.id], outreachId, on("2026-11-02"));
    expect(await sections()).toEqual([["trial", "Trial Lead"]]);
  });

  it("Done on a step logs it and the task moves on; quick tasks and snooze still work", async () => {
    const d = await lead("Due Lead");
    await enrolPeople(t.db, rep, [d.id], outreachId, NOW);
    await completeStep(t.db, rep, d.id, {}, NOW);
    expect(await sections()).toEqual([]); // waiting for acceptance now
    const r = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      r.id,
      { action: "gotReply", replyType: "Not now" },
      { now: on("2026-10-29") },
    );
    await expect(completeTask(t.db, other, `reply:${r.id}`, NOW)).rejects.toThrow(PermissionError);
    await snoozeLead(t.db, rep, r.id, NOW);
    expect(await sections()).toEqual([]);
    expect((await buildToday(t.db, rep, on("2026-10-31"))).tasks[0]?.name).toBe("Reply Lead");
    await completeTask(t.db, rep, `reply:${r.id}`, on("2026-10-31"));
    // Answered today: off Today (D-055). Replied with no next date, so the next day Today asks
    // for one (D-044).
    expect((await buildToday(t.db, rep, on("2026-10-31"))).tasks).toEqual([]);
    expect(
      (await buildToday(t.db, rep, on("2026-11-01"))).tasks.map((x) => [x.name, x.section]),
    ).toEqual([["Reply Lead", "nodate"]]);
  });

  it("Snooze to a date: hidden until then, then due that day, not a backlog (D-043)", async () => {
    const r = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      r.id,
      { action: "gotReply", replyType: "Not now" },
      { now: on("2026-10-27") },
    );
    expect((await buildToday(t.db, rep, NOW)).tasks[0].section).toBe("backlog");
    await expect(snoozeLead(t.db, rep, r.id, NOW, "2026-10-30")).rejects.toThrow("after today");
    await expect(snoozeLead(t.db, rep, r.id, NOW, "2027-03-01")).rejects.toThrow("within 60 days");
    await snoozeLead(t.db, rep, r.id, NOW, "2026-11-04");
    expect(await sections()).toEqual([]);
    expect((await buildToday(t.db, rep, on("2026-11-03"))).tasks).toEqual([]);
    const back = (await buildToday(t.db, rep, on("2026-11-04"))).tasks[0];
    expect(back).toMatchObject({ section: "reply", name: "Reply Lead", dueDate: "2026-11-04" });
    // Not done that day: it's a backlog from the next day.
    expect((await buildToday(t.db, rep, on("2026-11-05"))).tasks[0]).toMatchObject({
      section: "backlog",
      daysLate: 1,
    });
  });

  it("a plan step snoozed to a date comes back that day, within the weekly limit", async () => {
    const d = await lead("Step Lead");
    await enrolPeople(t.db, rep, [d.id], outreachId, on("2026-10-27"));
    const e = await snoozeStep(t.db, rep, d.id, NOW, "2026-11-03");
    expect(e.nextDueDate).toBe("2026-11-03");
    expect(await sections()).toEqual([]);
    expect((await buildToday(t.db, rep, on("2026-11-03"))).tasks[0]).toMatchObject({
      section: "due",
      name: "Step Lead",
    });
  });
});

describe("replies on a plan", () => {
  it("a reply that pauses a plan still shows under Replies waiting", async () => {
    const p = await lead("Plan Reply");
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-26"));
    const { logWithPlan } = await import("./plans/enrolment");
    await logWithPlan(
      t.db,
      rep,
      p.id,
      { action: "gotReply", replyType: "Interested" },
      { now: NOW },
    );
    expect(await sections()).toEqual([["reply", "Plan Reply"]]);
  });
});

describe("AI ranking (P01)", () => {
  it("uses the AI's order and reasons; keeps tasks it left out; ignores made-up ids", async () => {
    const [p1] = await t.db
      .insert(persona)
      .values({ name: "R&I", type: "Official", ownerId: rep.id, tier: 1 })
      .returning();
    const a = await lead("A Lead");
    const b = await lead("B Lead", { personaId: p1.id });
    const c = await lead("C Lead");
    for (const x of [a, b, c]) {
      await quickLog(
        t.db,
        rep,
        x.id,
        { action: "gotReply", replyType: "Interested" },
        { now: on("2026-10-29") },
      );
    }
    const { tasks } = await buildToday(t.db, rep, NOW);
    const ranked = applyRanking(tasks, {
      order: [
        { id: `reply:${c.id}`, reason: "Interested" },
        { id: "reply:made-up", reason: "x" },
        { id: `reply:${a.id}`, reason: "Warm" },
      ],
      summary: "Good week.",
    });
    expect(ranked.map((x) => [x.name, x.reason])).toEqual([
      ["C Lead", "Interested"],
      ["A Lead", "Warm"],
      ["B Lead", undefined],
    ]);
  });
});

describe("custom tasks and moving people to a new version (D-043)", () => {
  const trial = (steps: unknown[], extra: Record<string, unknown> = {}) =>
    planSchema.parse({
      name: "Pilot plan",
      planType: "Trial",
      type: "Official",
      steps,
      ...extra,
    });
  const custom = (label: string, waitDays: number) => ({
    channels: [{ channel: "Custom", when: "always", label }],
    waitDays,
  });

  it("a Custom task shows its name on Today and Done logs it as a task", async () => {
    const { plan: p } = await createPlan(t.db, rep, trial([custom("Send a case study", 0)]));
    const d = await lead("Custom Lead");
    await enrolPeople(t.db, rep, [d.id], p.id, NOW);
    const [task] = (await buildToday(t.db, rep, NOW)).tasks;
    expect(task).toMatchObject({ section: "trial", kind: "step", channel: "Manual task" });
    expect(task.detail).toBe("Step 1 of 1: Send a case study");
    await completeStep(t.db, rep, d.id, {}, NOW);
    const done = (await t.db.select().from(activity).where(eq(activity.personId, d.id))).find(
      (a) => a.type === "Task done",
    )!;
    expect(done.content).toContain("Send a case study");
  });

  it("saving changed steps can move the people on the old version, keeping their step", async () => {
    const { plan: p } = await createPlan(
      t.db,
      rep,
      trial([custom("Kick-off call", 0), custom("Check usage", 5)]),
    );
    const a = await lead("Mover");
    await enrolPeople(t.db, rep, [a.id], p.id, NOW);
    const kept = await updatePlan(
      t.db,
      rep,
      p.id,
      trial([custom("Kick-off call", 0), custom("Check usage", 4)]),
    );
    expect(kept).toMatchObject({ newVersion: true, moved: 0 });
    expect((await liveEnrolment(t.db, a.id))!.version).toBe(1);
    const moved = await updatePlan(
      t.db,
      rep,
      p.id,
      trial([custom("Kick-off call", 0), custom("Check usage", 4), custom("Renewal chat", 7)], {
        moveEnrolled: true,
      }),
    );
    expect(moved).toMatchObject({ newVersion: true, moved: 1 });
    const e = (await liveEnrolment(t.db, a.id))!;
    expect(e).toMatchObject({ version: 3, currentStep: 1 });
    expect((await buildToday(t.db, rep, NOW)).tasks[0].detail).toBe("Step 1 of 3: Kick-off call");
  });
});

describe("every follow-up shows until converted or lost (D-044)", () => {
  it("custom next actions due or overdue show; no date in an active stage shows; closed don't", async () => {
    // Like the owner's People page: overdue next actions in their own words.
    const akhil = await lead("Akhil Valsarjan", {
      stage: "Prospect",
      nextAction: "Call him and fix an appointment",
      nextActionDate: "2026-10-23",
    });
    await lead("Snigdha Mehra", {
      stage: "Prospect",
      nextAction: "Send message",
      nextActionDate: "2026-10-26",
    });
    await lead("Due Today", {
      stage: "Connected",
      nextAction: "Message",
      nextActionDate: "2026-10-30",
    });
    await lead("Mahesh Rao", {
      stage: "Replied",
      nextAction: "Respond",
      nextActionDate: "2026-10-31",
    });
    const noDate = await lead("No Date", { stage: "Meeting done" });
    await lead("Fresh Prospect", { stage: "Prospect" });
    await lead("Won Already", {
      stage: "Paid",
      nextAction: "Invoice",
      nextActionDate: "2026-10-20",
    });

    const plan = await buildToday(t.db, rep, NOW);
    const row = (name: string) => plan.tasks.find((x) => x.name === name);
    expect(row("Akhil Valsarjan")).toMatchObject({
      section: "backlog",
      origin: "followup",
      kind: "followup",
      daysLate: 7,
    });
    expect(row("Akhil Valsarjan")!.detail).toContain("Call him and fix an appointment");
    expect(row("Snigdha Mehra")).toMatchObject({ section: "backlog", daysLate: 4 });
    expect(row("Due Today")).toMatchObject({ section: "followup", kind: "followup" });
    // A future date: not yet.
    expect(row("Mahesh Rao")).toBeUndefined();
    expect(row("No Date")).toMatchObject({ section: "nodate", kind: "setdate" });
    // A prospect with no date isn't a task (until it's stale); Paid never is.
    expect(row("Fresh Prospect")).toBeUndefined();
    expect(row("Won Already")).toBeUndefined();

    // Set next follow-up: it leaves Today until that date, audited.
    await expect(
      setFollowUp(t.db, rep, akhil.id, { nextAction: "Call again", date: "2026-10-29" }, NOW),
    ).rejects.toThrow("Pick today or a later date.");
    await setFollowUp(t.db, rep, akhil.id, { nextAction: "Call again", date: "2026-11-02" }, NOW);
    await setFollowUp(
      t.db,
      rep,
      noDate.id,
      { nextAction: "Send the recap", date: "2026-11-03" },
      NOW,
    );
    const after = await buildToday(t.db, rep, NOW);
    expect(after.tasks.find((x) => x.name === "Akhil Valsarjan")).toBeUndefined();
    expect(after.tasks.find((x) => x.name === "No Date")).toBeUndefined();
    const later = await buildToday(t.db, rep, on("2026-11-02"));
    expect(later.tasks.find((x) => x.name === "Akhil Valsarjan")!.detail).toContain("Call again");
    await expect(
      setFollowUp(t.db, other, akhil.id, { nextAction: "x", date: "2026-11-05" }, NOW),
    ).rejects.toThrow(PermissionError);
  });

  it("a paused plan no longer hides the next action; an active plan follows its own dates", async () => {
    const paused = await lead("Paused Plan", { stage: "Connected" });
    await enrolPeople(t.db, rep, [paused.id], outreachId, on("2026-10-26"));
    const e = (await liveEnrolment(t.db, paused.id))!;
    await t.db.update(planEnrolment).set({ status: "Paused" }).where(eq(planEnrolment.id, e.id));
    await t.db
      .update(person)
      .set({ nextAction: "Respond", nextActionDate: "2026-10-30" })
      .where(eq(person.id, paused.id));
    const active = await lead("Active Plan", { stage: "Contacted" });
    await enrolPeople(t.db, rep, [active.id], outreachId, on("2026-10-30"));
    await completeStep(t.db, rep, active.id, {}, NOW); // waiting for acceptance now
    await t.db
      .update(person)
      .set({ nextAction: "Old note", nextActionDate: "2026-10-01" })
      .where(eq(person.id, active.id));

    const plan = await buildToday(t.db, rep, NOW);
    expect(plan.tasks.find((x) => x.name === "Paused Plan")).toMatchObject({ section: "followup" });
    expect(plan.tasks.find((x) => x.name === "Active Plan")).toBeUndefined();
    // The badges and the Team tab count the same.
    expect([...(await backlogByPerson(t.db, NOW)).keys()]).toEqual(
      plan.tasks.filter((x) => x.section === "backlog").map((x) => x.personId),
    );
  });
});
