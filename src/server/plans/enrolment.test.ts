import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, person, planEnrolment, template } from "@/lib/db/schema";
import { createTestDb, dbErrorText, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { planSchema } from "@/lib/validation/plans";
import { createPerson, updatePerson } from "../leads/people";
import {
  completeStep,
  enrolPeople,
  finishPlan,
  GuardrailWarning,
  liveEnrolment,
  logWithPlan,
  nurtureLost,
  planState,
  resumePlan,
  snoozeStep,
  switchPlan,
  withdrawInvite,
} from "./enrolment";
import { createPlan, updatePlan } from "./plans";
import { seedPlans } from "./seed";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
let outreachId: string;

// Mon 19 Oct 2026 … noon IST on each date.
const on = (date: string) => new Date(`${date}T06:30:00Z`);

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  await t.db.insert(template).values([
    {
      name: "M1",
      type: "Official",
      ownerId: admin.id,
      purpose: "Message 1",
      level: "Any",
      body: "Hi {Name}, how does {Company} run research?",
    },
    {
      name: "FU1",
      type: "Official",
      ownerId: admin.id,
      purpose: "Follow-up 1",
      level: "Any",
      body: "{Name}, here's a 60-second look: {video}",
    },
    {
      name: "FU2",
      type: "Official",
      ownerId: admin.id,
      purpose: "Follow-up 2",
      level: "Any",
      body: "Thought this might help, {Name}.",
    },
    {
      name: "BU",
      type: "Official",
      ownerId: admin.id,
      purpose: "Break-up",
      level: "Any",
      body: "I'll leave it here, {Name}.",
    },
  ]);
  await seedPlans(t.db, admin.id);
  const { plan } = await import("@/lib/db/schema");
  const [row] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
  outreachId = row.id;
});
afterEach(() => t.cleanup());

let n = 0;
async function lead(extra: Record<string, unknown> = {}, owner = rep) {
  n += 1;
  return createPerson(
    t.db,
    owner,
    personSchema.parse({
      fullName: `Priya Lead${n}`,
      linkedinUrl: `linkedin.com/in/plan-${n}`,
      companyName: "Acme",
      stage: "Prospect",
      ...extra,
    }),
  );
}
const enrolment = async (personId: string) => (await liveEnrolment(t.db, personId))!;

describe("enrolling (F17)", () => {
  it("step 1 is due on the enrolment date; one live plan per person, enforced by the database", async () => {
    const p = await lead();
    const r = await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    expect(r).toEqual({ enrolled: [p.fullName], skipped: [] });
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 1,
      nextDueDate: "2026-10-19",
      version: 1,
      status: "Active",
    });
    const again = await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    expect(again.skipped).toEqual([{ name: p.fullName, reason: "already on a plan" }]);
    const e = await enrolment(p.id);
    const err = await dbErrorText(() =>
      t.db
        .insert(planEnrolment)
        .values({ personId: p.id, planId: outreachId, version: 1, startedAt: new Date() }),
    );
    expect(err).toMatch(/UNIQUE constraint failed/);
    expect(e.status).toBe("Active");
  });

  it("skips Do not contact, Nurture and other reps' leads, with the reason", async () => {
    const dnc = await lead({ doNotContact: true, dncReason: "Asked us to stop" });
    const theirs = await lead({}, other);
    const nurture = await lead();
    await t.db.update(person).set({ nurtureUntil: "2026-12-01" }).where(eq(person.id, nurture.id));
    const r = await enrolPeople(
      t.db,
      rep,
      [dnc.id, theirs.id, nurture.id],
      outreachId,
      on("2026-10-19"),
    );
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Do not contact",
      "not your lead",
      "in Nurture until 2026-12-01",
    ]);
  });

  it("Proposed (draft) plans can't be used until approved", async () => {
    const { plan } = await import("@/lib/db/schema");
    const [draft] = await t.db.select().from(plan).where(eq(plan.name, "Trial (draft)"));
    await expect(enrolPeople(t.db, admin, [(await lead()).id], draft.id)).rejects.toThrow(
      /waiting for approval/,
    );
  });
});

describe("doing the seed plan's steps", () => {
  it("on time, waiting for acceptance, then late: later steps shift; weekends skipped", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    // Step 1: connection request (no note) on Mon 19 Oct.
    await completeStep(t.db, rep, p.id, {}, on("2026-10-19"));
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 2,
      waitingForAcceptance: true,
      nextDueDate: "2026-11-02",
    });
    await expect(completeStep(t.db, rep, p.id, { text: "Hi" }, on("2026-10-20"))).rejects.toThrow(
      /accept/,
    );
    // Accepted Thu 22 Oct → Message 1 due Sat 24 → Mon 26; ends_by = 22 Oct + 30.
    await logWithPlan(t.db, rep, p.id, { action: "accepted" }, { now: on("2026-10-22") });
    expect(await enrolment(p.id)).toMatchObject({
      waitingForAcceptance: false,
      nextDueDate: "2026-10-26",
      endsBy: "2026-11-21",
      acceptedDate: "2026-10-22",
    });
    // The message is filled in from the person; Done is refused while {video} is left.
    const state = await planState(t.db, p.id, "2026-10-26");
    expect(state?.message).toBe("Hi Priya, how does Acme run research?");
    // Message 1 done 3 days late (Thu 29): Follow-up 1 = 29 + 4 = Mon 2 Nov.
    await completeStep(t.db, rep, p.id, { text: state!.message }, on("2026-10-29"));
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 3, nextDueDate: "2026-11-02" });
    await expect(
      completeStep(
        t.db,
        rep,
        p.id,
        { text: "Priya, here's a 60-second look: {video}" },
        on("2026-11-02"),
      ),
    ).rejects.toThrow("Fill in {video} first.");
    await completeStep(
      t.db,
      rep,
      p.id,
      { text: "Priya, here's a 60-second look: https://lumor.tech/v" },
      on("2026-11-02"),
    );
    // Step 4: no phone, no email → LinkedIn message, due 2 Nov + 7 = Mon 9 Nov.
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 4, nextDueDate: "2026-11-09" });
    const step4 = await planState(t.db, p.id, "2026-11-09");
    expect(step4?.channel).toBe("LinkedIn message");
    const rows = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, p.id), eq(activity.type, "Message sent")));
    expect(rows.map((r) => r.planStepOrder)).toEqual([2, 3]);
  });

  it("step 4 is a call when a phone is known: no answer retries the next business day, up to 2 times", async () => {
    const p = await lead({ phone: "+91 98765 43210" });
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    const e = await enrolment(p.id);
    await t.db
      .update(planEnrolment)
      .set({ currentStep: 4, nextDueDate: "2026-10-23" })
      .where(eq(planEnrolment.id, e.id));
    expect((await planState(t.db, p.id, "2026-10-23"))?.channel).toBe("Call");
    await expect(completeStep(t.db, rep, p.id, {}, on("2026-10-23"))).rejects.toThrow(/outcome/);
    await completeStep(t.db, rep, p.id, { outcome: "No answer" }, on("2026-10-23")); // Fri → Mon
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 4,
      callAttempts: 1,
      nextDueDate: "2026-10-26",
    });
    await completeStep(t.db, rep, p.id, { outcome: "No answer" }, on("2026-10-26"));
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 4,
      callAttempts: 2,
      nextDueDate: "2026-10-27",
    });
    await completeStep(t.db, rep, p.id, { outcome: "No answer" }, on("2026-10-27"));
    expect(await enrolment(p.id)).toMatchObject({
      currentStep: 5,
      callAttempts: 0,
      nextDueDate: "2026-11-06",
    });
  });

  it("call outcomes: Wrong number removes the phone; Not interested stops the plan", async () => {
    const p = await lead({ phone: "+91 98765 43210" });
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    const e = await enrolment(p.id);
    await t.db.update(planEnrolment).set({ currentStep: 4 }).where(eq(planEnrolment.id, e.id));
    await completeStep(t.db, rep, p.id, { outcome: "Wrong number" }, on("2026-10-23"));
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(row.phone).toBeNull();
    const q = await lead({ phone: "+91 90000 00000" });
    await enrolPeople(t.db, rep, [q.id], outreachId, on("2026-10-19"));
    const eq2 = await enrolment(q.id);
    await t.db.update(planEnrolment).set({ currentStep: 4 }).where(eq(planEnrolment.id, eq2.id));
    await completeStep(t.db, rep, q.id, { outcome: "Not interested" }, on("2026-10-23"));
    expect(await liveEnrolment(t.db, q.id)).toBeNull();
  });

  it("no acceptance in 14 days: Withdraw stops the plan and starts 60 days of Nurture", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await completeStep(t.db, rep, p.id, {}, on("2026-10-19"));
    expect((await planState(t.db, p.id, "2026-11-02"))?.withdrawDue).toBe(true);
    await withdrawInvite(t.db, rep, p.id, on("2026-11-02"));
    expect(await liveEnrolment(t.db, p.id)).toBeNull();
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(row).toMatchObject({ nurtureUntil: "2027-01-01", stage: "Prospect" });
    await expect(
      logWithPlan(t.db, rep, p.id, { action: "messageSent" }, { now: on("2026-11-03") }),
    ).rejects.toThrow(/Nurture/);
  });
});

describe("replies, resume, versions, Do not contact", () => {
  it("a logged reply pauses the plan; resume makes the step due again and moves ends_by", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await completeStep(t.db, rep, p.id, {}, on("2026-10-19"));
    await logWithPlan(t.db, rep, p.id, { action: "accepted" }, { now: on("2026-10-20") });
    await logWithPlan(
      t.db,
      rep,
      p.id,
      { action: "gotReply", replyType: "Not now" },
      { now: on("2026-10-21") },
    );
    expect(await enrolment(p.id)).toMatchObject({ status: "Paused", endsBy: "2026-11-19" });
    const [reply] = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, p.id), eq(activity.type, "Reply received")));
    expect(reply.planStepOrder).toBe(1);
    await resumePlan(t.db, rep, p.id, on("2026-10-31")); // Saturday → Monday
    expect(await enrolment(p.id)).toMatchObject({
      status: "Active",
      nextDueDate: "2026-11-02",
      endsBy: "2026-11-29",
    });
  });

  it("editing the plan makes version 2; people already enrolled keep version 1", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await updatePlan(
      t.db,
      admin,
      outreachId,
      planSchema.parse({
        name: "Official Outreach",
        planType: "Outreach",
        type: "Official",
        steps: [
          { channels: [{ channel: "LinkedIn connection request", when: "always" }], waitDays: 0 },
          { channels: [{ channel: "LinkedIn message", when: "always" }], waitDays: 3 },
        ],
      }),
    );
    expect((await enrolment(p.id)).version).toBe(1);
    expect((await planState(t.db, p.id, "2026-10-19"))?.steps).toHaveLength(5);
    const q = await lead();
    await enrolPeople(t.db, rep, [q.id], outreachId, on("2026-10-19"));
    expect((await enrolment(q.id)).version).toBe(2);
  });

  it("Do not contact stops the plan and blocks outreach", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await updatePerson(
      t.db,
      rep,
      p.id,
      personSchema.parse({
        fullName: p.fullName,
        linkedinUrl: p.linkedinUrl,
        stage: p.stage,
        doNotContact: true,
        dncReason: "Asked us to stop",
      }),
    );
    expect(await liveEnrolment(t.db, p.id)).toBeNull();
    await expect(logWithPlan(t.db, rep, p.id, { action: "messageSent" })).rejects.toThrow(
      /Do not contact/,
    );
  });

  it("users can't work another rep's plan; switching stops one plan and starts another", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await expect(completeStep(t.db, other, p.id, {}, on("2026-10-19"))).rejects.toThrow(
      PermissionError,
    );
    const { plan } = await createPlan(
      t.db,
      rep,
      planSchema.parse({
        name: "My check-in",
        planType: "Meeting follow-up",
        type: "Personal",
        steps: [
          {
            channels: [{ channel: "Manual task", when: "always" }],
            waitDays: 1,
            script: "Send the recap",
          },
        ],
      }),
    );
    await switchPlan(t.db, rep, p.id, plan.id, on("2026-10-20"));
    expect(await enrolment(p.id)).toMatchObject({ planId: plan.id, nextDueDate: "2026-10-21" });
  });
});

describe("quick-log on a plan, guardrails and finishing", () => {
  it("Yes = this is the plan step (advances); No = an extra touch, checked by the guardrails", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    await logWithPlan(
      t.db,
      rep,
      p.id,
      { action: "requestSent" },
      { now: on("2026-10-19"), asStep: true },
    );
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 2, waitingForAcceptance: true });
    await logWithPlan(t.db, rep, p.id, { action: "accepted" }, { now: on("2026-10-19") });
    // An extra message on the day they accepted: guardrail 1 warns.
    const warning = await logWithPlan(
      t.db,
      rep,
      p.id,
      { action: "messageSent" },
      { now: on("2026-10-19") },
    ).catch((e) => e);
    expect(warning).toBeInstanceOf(GuardrailWarning);
    expect(warning.findings[0].rule).toBe(1);
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 2 }); // nothing logged, plan unchanged
    // Logging anyway is recorded in the audit log.
    await logWithPlan(
      t.db,
      rep,
      p.id,
      { action: "messageSent" },
      { now: on("2026-10-19"), override: true },
    );
    const last = (await t.db.select().from(auditLog))
      .filter((a) => a.entityType === "Activity")
      .at(-1)!;
    expect(last.changes).toMatchObject({ guardrailOverride: { after: "1" } });
    expect(await enrolment(p.id)).toMatchObject({ currentStep: 2 }); // an extra touch doesn't advance
  });

  it("finished with no reply: Nurture or Lost; when Nurture ends, re-enrol or Lost", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    const e = await enrolment(p.id);
    await expect(finishPlan(t.db, rep, p.id, "nurture", on("2026-10-19"))).rejects.toThrow(
      /isn't finished/,
    );
    await t.db
      .update(planEnrolment)
      .set({ currentStep: 6, nextDueDate: null })
      .where(eq(planEnrolment.id, e.id));
    expect((await planState(t.db, p.id, "2026-11-30"))?.finished).toBe(true);
    await finishPlan(t.db, rep, p.id, "nurture", on("2026-11-30"));
    const [row] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(row.nurtureUntil).toBe("2027-01-29");
    await nurtureLost(t.db, rep, p.id, on("2027-01-29"));
    const [lost] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(lost).toMatchObject({ stage: "Lost", lostReason: "No response", nurtureUntil: null });
  });

  it("past ends_by counts as finished; snooze moves to tomorrow within the weekly limit", async () => {
    const p = await lead();
    await enrolPeople(t.db, rep, [p.id], outreachId, on("2026-10-19"));
    const e = await enrolment(p.id);
    await t.db
      .update(planEnrolment)
      .set({ endsBy: "2026-11-01" })
      .where(eq(planEnrolment.id, e.id));
    expect((await planState(t.db, p.id, "2026-11-02"))?.finished).toBe(true);
    await t.db.update(planEnrolment).set({ endsBy: null }).where(eq(planEnrolment.id, e.id));
    // Two touches already on 19 and 21 Oct; tomorrow (Thu 22) would be a 3rd in 7 days.
    for (const d of ["2026-10-19", "2026-10-21"]) {
      await t.db
        .insert(activity)
        .values({ personId: p.id, userId: rep.id, occurredAt: on(d), type: "Message sent" });
    }
    await snoozeStep(t.db, rep, p.id, on("2026-10-21"));
    expect((await enrolment(p.id)).nextDueDate).toBe("2026-10-26"); // Mon 26: the first allowed weekday
  });
});
