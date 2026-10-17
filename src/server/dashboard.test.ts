import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, persona } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { conversions, dashboard, periodFor, type Counts } from "./dashboard";
import { createPerson, updatePerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";

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
      requests: 1,
      accepted: 1,
      replied: 1,
      interested: 1,
      demoBooked: 1,
      demoHeld: 1,
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

  it("Trial counts stage changes to Trial/Pilot", async () => {
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
    expect((await dashboard(t.db, periodFor("week", "2026-10-18"), "rep")).totals.requests).toBe(1);
    expect((await dashboard(t.db, periodFor("week", "2026-10-19"), "rep")).totals.requests).toBe(0);
  });
});

describe("conversions and benchmarks", () => {
  const counts = (over: Partial<Counts>): Counts => ({
    requests: 0,
    accepted: 0,
    replied: 0,
    interested: 0,
    demoBooked: 0,
    demoHeld: 0,
    trial: 0,
    paid: 0,
    ...over,
  });

  it("amber below benchmark only with 10+ in the earlier stage; otherwise low sample", () => {
    const [ra] = conversions(counts({ requests: 10, accepted: 2 }));
    expect(ra).toMatchObject({ rate: 0.2, status: "below", benchmark: 0.3 });
    const [ok] = conversions(counts({ requests: 10, accepted: 3 }));
    expect(ok.status).toBe("ok");
    const [low] = conversions(counts({ requests: 2, accepted: 0 }));
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
    expect(byRep.breakdown.map((g) => [g.label, g.counts.requests, g.counts.accepted])).toEqual([
      ["Asha", 1, 0],
      ["Ravi", 1, 1],
    ]);
    const byPersona = await dashboard(t.db, periodFor("week", "2026-10-14"), "persona");
    expect(byPersona.breakdown.map((g) => g.label)).toEqual(["Research & Insights", "Not set"]);
  });
});
