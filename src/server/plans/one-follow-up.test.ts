// D-061: one follow-up per person. The plan writes its next date onto the person; a follow-up set
// anywhere moves the plan; My tasks, People and the person page all read the same date.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, person, plan, planEnrolment } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { addEntry } from "../conversation";
import { createPerson, updatePerson } from "../leads/people";
import { buildDay, buildToday, setFollowUp } from "../today";
import {
  completeStep,
  enrolPeople,
  liveEnrolment,
  pausePlan,
  stopPlan,
  syncPlanFollowUps,
} from "./enrolment";
import { seedPlans } from "./seed";

const on = (date: string) => new Date(`${date}T06:30:00Z`); // noon IST

describe("one follow-up per person (D-061)", () => {
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

  async function lead(nextActionDate?: string) {
    n += 1;
    return createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: `Isha Sync${n}`,
        linkedinUrl: `linkedin.com/in/sync-${n}`,
        companyName: "Acme",
        stage: "Contacted",
        ...(nextActionDate ? { nextAction: "Old follow-up", nextActionDate } : {}),
      }),
    );
  }
  const personOf = async (id: string) =>
    (await t.db.select().from(person).where(eq(person.id, id)))[0];
  const planDate = async (id: string) => (await liveEnrolment(t.db, id))?.nextDueDate ?? null;

  it("putting someone on a plan replaces their follow-up with the plan's step and date", async () => {
    const p = await lead("2026-10-30");
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    expect(await personOf(p.id)).toMatchObject({
      nextAction: "Step 1 of 5: LinkedIn connection request",
      nextActionDate: "2026-10-19",
    });
    // My tasks and the logged list read the same date.
    const today = await buildToday(t.db, rep, on("2026-10-19"));
    expect(today.tasks.find((x) => x.personId === p.id)).toMatchObject({
      kind: "step",
      detail: "Step 1 of 5: LinkedIn connection request",
    });
  });

  it("doing a step writes the next step's date onto the person", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await t.db
      .update(planEnrolment)
      .set({ currentStep: 2, nextDueDate: "2026-10-19" })
      .where(eq(planEnrolment.personId, p.id));
    await completeStep(
      t.db,
      rep,
      p.id,
      { text: "Hi Isha, how do you run studies?" },
      on("2026-10-19"),
    );
    expect(await planDate(p.id)).toBe("2026-10-23"); // Message 1's 4-day follow-up
    expect(await personOf(p.id)).toMatchObject({
      nextAction: "Step 3 of 5: LinkedIn message",
      nextActionDate: "2026-10-23",
    });
    // Next day on My tasks finds it on that day.
    const day = await buildDay(t.db, rep, "2026-10-23", on("2026-10-19"));
    expect(day.tasks.find((x) => x.personId === p.id)).toMatchObject({ kind: "step" });
  });

  it("a follow-up changed on My tasks, People or the conversation moves the plan", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    // My tasks: Set next follow-up / the date beside a log.
    await setFollowUp(t.db, rep, p.id, { nextAction: null, date: "2026-10-21" }, on("2026-10-19"));
    expect(await planDate(p.id)).toBe("2026-10-21");
    expect((await personOf(p.id)).nextAction).toBe("Step 1 of 5: LinkedIn connection request");
    // People: the person form.
    const before = await personOf(p.id);
    await updatePerson(
      t.db,
      rep,
      p.id,
      personSchema.parse({
        fullName: before.fullName,
        linkedinUrl: before.linkedinUrl,
        companyName: "Acme",
        stage: before.stage,
        nextAction: "Send the deck",
        nextActionDate: "2026-10-22",
      }),
    );
    expect(await planDate(p.id)).toBe("2026-10-22");
    // The conversation's Next follow-up.
    await addEntry(
      t.db,
      rep,
      p.id,
      {
        from: "note",
        channel: "LinkedIn",
        at: on("2026-10-19"),
        text: "Asked to wait a week",
        replyType: null,
        replyBy: null,
        followUpDate: null,
      },
      { now: on("2026-10-19") },
    );
    await addEntry(
      t.db,
      rep,
      p.id,
      {
        from: "them",
        channel: "LinkedIn",
        at: on("2026-10-19"),
        text: "Next week works",
        replyType: null,
        replyBy: null,
        followUpDate: "2026-10-26",
      },
      { now: on("2026-10-19") },
    );
    // A reply pauses the plan; the follow-up they typed is kept on the person.
    expect((await personOf(p.id)).nextActionDate).toBe("2026-10-26");
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Paused");
    // My tasks shows it on the 22nd with the rep's words beside the step.
    const q = await lead();
    await enrolPeople(t.db, rep, [q.id], outreachId, on("2026-10-19"));
    const qBefore = await personOf(q.id);
    await updatePerson(
      t.db,
      rep,
      q.id,
      personSchema.parse({
        fullName: qBefore.fullName,
        linkedinUrl: qBefore.linkedinUrl,
        companyName: "Acme",
        stage: qBefore.stage,
        nextAction: "Send the deck",
        nextActionDate: "2026-10-22",
      }),
    );
    const day = await buildDay(t.db, rep, "2026-10-22", on("2026-10-19"));
    expect(day.tasks.find((x) => x.personId === q.id)).toMatchObject({
      kind: "step",
      detail: "Step 1 of 5: LinkedIn connection request · Send the deck",
    });
  });

  it("pausing or stopping clears the plan's follow-up; the rep's own stays", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await pausePlan(t.db, rep, p.id, on("2026-10-19"));
    expect(await personOf(p.id)).toMatchObject({ nextAction: null, nextActionDate: null });
    const q = await lead();
    await enrolPeople(t.db, rep, [q.id], outreachId, on("2026-10-19"));
    await setFollowUp(
      t.db,
      rep,
      q.id,
      { nextAction: "Call", date: "2026-10-22" },
      on("2026-10-19"),
    );
    await stopPlan(t.db, rep, q.id, "Not now", on("2026-10-19"));
    expect(await personOf(q.id)).toMatchObject({
      nextAction: "Call",
      nextActionDate: "2026-10-22",
    });
  });

  it("the deploy sync brings old plans and follow-ups in line, once", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    // As before this release: the plan and the person disagree.
    await t.db
      .update(person)
      .set({
        nextAction: "Old follow-up",
        nextActionDate: "2026-10-01",
        nextActionSetAt: on("2026-09-30"),
      })
      .where(eq(person.id, p.id));
    expect(await syncPlanFollowUps(t.db, on("2026-10-19"))).toBe(1);
    expect(await personOf(p.id)).toMatchObject({
      nextAction: "Step 1 of 5: LinkedIn connection request",
      nextActionDate: "2026-10-19",
    });
    expect(await syncPlanFollowUps(t.db, on("2026-10-19"))).toBe(0);
    // A follow-up the rep set after the plan last changed wins: the plan moves to it.
    await t.db
      .update(person)
      .set({
        nextAction: "Call after the offsite",
        nextActionDate: "2099-01-05",
        nextActionSetAt: new Date(Date.now() + 60_000),
      })
      .where(eq(person.id, p.id));
    expect(await syncPlanFollowUps(t.db, on("2026-10-19"))).toBe(1);
    expect(await planDate(p.id)).toBe("2099-01-05");
    const audit = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(audit.length).toBeGreaterThan(0);
  });
});
