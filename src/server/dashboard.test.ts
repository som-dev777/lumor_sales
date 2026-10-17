import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activity, persona, plan } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { conversions, dashboard, periodFor, type Counts } from "./dashboard";
import { createPerson, updatePerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import { completeStep, enrolPeople, logWithPlan } from "./plans/enrolment";
import { seedPlans } from "./plans/seed";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let rep2: Actor;
beforeEach(async () => {
  t = await createTestDb();
  const r = await insertTestUser(t.db, { name: "Asha" });
  const r2 = await insertTestUser(t.db, { name: "Ravi" });
  rep = { id: r.id, role: "User", active: true };
  rep2 = { id: r2.id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const at = (d: number, hour = 6, month = 9) => new Date(Date.UTC(2026, month, d, hour, 0));
let n = 0;
async function lead(actor: Actor, extra: Record<string, unknown> = {}) {
  n += 1;
  return createPerson(
    t.db,
    actor,
    personSchema.parse({
      fullName: `Lead ${n}`,
      linkedinUrl: `linkedin.com/in/lead-${n}`,
      stage: "Prospect",
      ...extra,
    }),
  );
}
const ql = (actor: Actor, id: string, l: Parameters<typeof quickLog>[3], now: Date) =>
  quickLog(t.db, actor, id, l, { now });

describe("periods (IST)", () => {
  it("weeks run Monday–Sunday; months follow the calendar", () => {
    const w = periodFor("week", "2026-10-16");
    expect(w).toMatchObject({
      anchor: "2026-10-12",
      label: "12 Oct – 18 Oct 2026",
      prev: "2026-10-11",
      next: "2026-10-19",
    });
    expect(w.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    const m = periodFor("month", "2026-10-16");
    expect(m).toMatchObject({ anchor: "2026-10-01", label: "Oct 2026", next: "2026-11-01" });
  });
});

describe("funnel counts", () => {
  it("one lead walked to Paid counts once at every stage", async () => {
    const p = await lead(rep);
    await ql(rep, p.id, { action: "requestSent" }, at(12));
    await ql(rep, p.id, { action: "accepted" }, at(13));
    await ql(rep, p.id, { action: "messageSent" }, at(13, 7));
    await ql(rep, p.id, { action: "gotReply", replyType: "Interested" }, at(14));
    await ql(rep, p.id, { action: "meetingBooked", meetingDate: "2026-10-16" }, at(14, 7));
    await ql(rep, p.id, { action: "meetingHeld" }, at(16));
    await updatePerson(
      t.db,
      rep,
      p.id,
      personSchema.parse({
        fullName: p.fullName,
        linkedinUrl: p.linkedinUrl,
        stage: "Trial",
      }),
    );
    await ql(rep, p.id, { action: "markConverted" }, at(17));

    const d = await dashboard(t.db, periodFor("week", "2026-10-14"), "rep");
    // Trial was set "now" (outside this past week) by updatePerson; count it in its own week.
    expect(d.totals).toMatchObject({
      contacted: 1,
      connected: 1,
      replied: 1,
      interested: 1,
      meetingScheduled: 1,
      meetingDone: 1,
      paid: 1,
    });
  });

  it("Replied counts each person's first reply only, in the period it happened", async () => {
    const p = await lead(rep);
    await ql(rep, p.id, { action: "gotReply", replyType: "Not now" }, at(5)); // previous week
    await ql(rep, p.id, { action: "gotReply", replyType: "Interested" }, at(14));
    const d = await dashboard(t.db, periodFor("week", "2026-10-14"), "rep");
    expect(d.totals.replied).toBe(0);
    expect(d.totals.interested).toBe(1);
    expect((await dashboard(t.db, periodFor("week", "2026-10-05"), "rep")).totals.replied).toBe(1);
  });

  it("Contacted counts each person's first touch of any kind, once", async () => {
    const p = await lead(rep);
    await ql(rep, p.id, { action: "callLogged", outcome: "No answer" }, at(12)); // not a touch
    await ql(rep, p.id, { action: "messageSent", channel: "Email" }, at(13));
    await ql(rep, p.id, { action: "requestSent" }, at(14));
    const d = await dashboard(t.db, periodFor("week", "2026-10-14"), "rep");
    expect(d.totals.contacted).toBe(1);
  });

  it("Trial and Proposal sent count stage changes to them", async () => {
    const p = await lead(rep);
    await updatePerson(
      t.db,
      rep,
      p.id,
      personSchema.parse({
        fullName: p.fullName,
        linkedinUrl: p.linkedinUrl,
        stage: "Trial",
      }),
    );
    const d = await dashboard(t.db, periodFor("week"), "rep");
    expect(d.totals.trial).toBe(1);
    await ql(rep, p.id, { action: "proposalSent" }, new Date());
    expect((await dashboard(t.db, periodFor("week"), "rep")).totals.proposal).toBe(1);
  });

  it("an activity at 11pm IST Sunday belongs to that week, not the next", async () => {
    const p = await lead(rep);
    // Sunday 18 Oct 2026, 23:00 IST = 17:30 UTC
    await t.db.insert(activity).values({
      personId: p.id,
      userId: rep.id,
      occurredAt: new Date(Date.UTC(2026, 9, 18, 17, 30)),
      type: "Request sent",
    });
    expect((await dashboard(t.db, periodFor("week", "2026-10-18"), "rep")).totals.contacted).toBe(
      1,
    );
    expect((await dashboard(t.db, periodFor("week", "2026-10-19"), "rep")).totals.contacted).toBe(
      0,
    );
  });
});

describe("conversions and benchmarks", () => {
  const counts = (over: Partial<Counts>): Counts => ({
    contacted: 0,
    connected: 0,
    replied: 0,
    interested: 0,
    meetingScheduled: 0,
    meetingDone: 0,
    proposal: 0,
    trial: 0,
    paid: 0,
    active: 0,
    ...over,
  });

  it("amber below benchmark only with 10+ in the earlier stage; otherwise low sample", () => {
    const [ra] = conversions(counts({ contacted: 10, connected: 2 }));
    expect(ra).toMatchObject({ rate: 0.2, status: "below", benchmark: 0.3 });
    const [ok] = conversions(counts({ contacted: 10, connected: 3 }));
    expect(ok.status).toBe("ok");
    const [low] = conversions(counts({ contacted: 2, connected: 0 }));
    expect(low).toMatchObject({ status: "low", rate: 0 });
    const [none] = conversions(counts({}));
    expect(none).toMatchObject({ status: "low", rate: null });
  });
});

describe("breakdowns", () => {
  it("by rep and by persona, with 'Not set' last", async () => {
    const [ri] = await t.db
      .insert(persona)
      .values({ name: "Research & Insights", type: "Official", ownerId: rep.id, tier: 1 })
      .returning();
    const a = await lead(rep, { personaId: ri.id });
    const b = await lead(rep2);
    await ql(rep, a.id, { action: "requestSent" }, at(13));
    await ql(rep2, b.id, { action: "requestSent" }, at(13));
    await ql(rep2, b.id, { action: "accepted" }, at(14));

    const byRep = await dashboard(t.db, periodFor("week", "2026-10-14"), "rep");
    expect(byRep.breakdown.map((g) => [g.label, g.counts.contacted, g.counts.connected])).toEqual([
      ["Asha", 1, 0],
      ["Ravi", 1, 1],
    ]);
    const byPersona = await dashboard(t.db, periodFor("week", "2026-10-14"), "persona");
    expect(byPersona.breakdown.map((g) => g.label)).toEqual(["Research & Insights", "Not set"]);
  });
});

describe("plan reply rates (F17)", () => {
  it("per plan: enrolled, replied and converted; per step: touches and the replies after them", async () => {
    const admin = await insertTestUser(t.db, { name: "Somnath", role: "Admin" });
    await seedPlans(t.db, admin.id);
    const [outreach] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    const a = await lead(rep);
    const b = await lead(rep);
    await enrolPeople(t.db, rep, [a.id, b.id], outreach.id, at(12));
    await completeStep(t.db, rep, a.id, {}, at(12));
    await completeStep(t.db, rep, b.id, {}, at(12));
    await logWithPlan(
      t.db,
      rep,
      a.id,
      { action: "gotReply", replyType: "Interested" },
      { now: at(14) },
    );
    const d = await dashboard(t.db, periodFor("week", "2026-10-14"), "rep");
    expect(d.plans).toEqual([
      {
        planId: outreach.id,
        name: "Official Outreach",
        enrolled: 2,
        replied: 1,
        converted: 0,
        replyRate: 0.5,
        steps: [{ order: 1, done: 2, replies: 1, rate: 0.5 }],
      },
    ]);
  });
});
