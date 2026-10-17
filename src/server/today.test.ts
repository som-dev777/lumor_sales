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
import { createPlan } from "./plans/plans";
import { seedPlans } from "./plans/seed";
import { applyRanking, buildToday, completeTask, snoozeLead } from "./today";

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

    expect(await sections()).toEqual([
      ["reply", "Reply Lead"],
      ["meeting", "Meeting Lead"],
      ["deadline", "Deadline Lead"],
      ["due", "Due Lead"],
      ["due", "Withdraw Lead"],
      ["overdue", "Overdue Lead"],
      ["finished", "Finished Lead"],
      ["nurture", "Nurture Lead"],
      ["stale", "Stale Lead"],
    ]);
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
    expect((await buildToday(t.db, rep, on("2026-10-31"))).tasks).toEqual([]);
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
