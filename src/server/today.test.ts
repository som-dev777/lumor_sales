import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, person, persona } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { createPerson } from "./leads/people";
import { quickLog } from "./leads/quicklog";
import { applyRanking, buildToday, completeTask, snoozeLead } from "./today";

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let other: Actor;
beforeEach(async () => {
  t = await createTestDb();
  const r = await insertTestUser(t.db, { name: "Asha" });
  const o = await insertTestUser(t.db, { name: "Ravi" });
  rep = { id: r.id, role: "User", active: true };
  other = { id: o.id, role: "User", active: true };
});
afterEach(() => t.cleanup());

// "Now" is Friday 30 Oct 2026, noon IST.
const NOW = new Date(Date.UTC(2026, 9, 30, 6, 30));
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 6, 0));
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
const sectionOf = async (name: string) =>
  (await buildToday(t.db, rep, NOW)).tasks.find((x) => x.name === name)?.section ?? null;

describe("Today sections (F08)", () => {
  it("builds each section from the rules, one section per lead", async () => {
    const reply = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      reply.id,
      { action: "gotReply", replyType: "Interested" },
      { now: day(29) },
    );
    const demo = await lead("Demo Lead");
    await quickLog(
      t.db,
      rep,
      demo.id,
      { action: "demoBooked", demoDate: "2026-10-30" },
      { now: day(20) },
    );
    const fu = await lead("Follow Lead");
    await quickLog(t.db, rep, fu.id, { action: "message1Sent" }, { now: day(26) }); // FU1 due 30 Oct
    const notYet = await lead("Not Yet");
    await quickLog(t.db, rep, notYet.id, { action: "message1Sent" }, { now: day(28) });
    const withdraw = await lead("Withdraw Lead");
    await quickLog(t.db, rep, withdraw.id, { action: "requestSent" }, { now: day(15) }); // > 14 days
    const fresh = await lead("Fresh Request");
    await quickLog(t.db, rep, fresh.id, { action: "requestSent" }, { now: day(20) });
    const stale = await lead("Stale Lead");
    await t.db
      .insert(activity)
      .values({ personId: stale.id, userId: rep.id, occurredAt: day(5), type: "Message sent" });
    await lead("Someone Else's", {}, other);

    const plan = await buildToday(t.db, rep, NOW);
    expect(plan.tasks.map((x) => [x.section, x.name])).toEqual([
      ["reply", "Reply Lead"],
      ["demo", "Demo Lead"],
      ["followUp", "Follow Lead"],
      ["withdraw", "Withdraw Lead"],
      ["stale", "Stale Lead"],
    ]);
    expect(plan.outreach).toMatchObject({ sent: 0, target: 20, left: 20 });
  });

  it("Done logs the matching quick-log and the task goes away", async () => {
    const reply = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      reply.id,
      { action: "gotReply", replyType: "Not now" },
      { now: day(29) },
    );
    await completeTask(t.db, rep, `reply:${reply.id}`, NOW);
    expect(await sectionOf("Reply Lead")).toBeNull();

    const withdraw = await lead("Withdraw Lead");
    await quickLog(t.db, rep, withdraw.id, { action: "requestSent" }, { now: day(10) });
    await completeTask(t.db, rep, `withdraw:${withdraw.id}`, NOW);
    const [p] = await t.db.select().from(person).where(eq(person.id, withdraw.id));
    expect(p).toMatchObject({ stage: "Prospect", sequenceStep: "Not started" });
    await expect(completeTask(t.db, other, `reply:${reply.id}`, NOW)).rejects.toThrow(
      PermissionError,
    );
  });

  it("Snooze hides a lead until tomorrow", async () => {
    const reply = await lead("Reply Lead");
    await quickLog(
      t.db,
      rep,
      reply.id,
      { action: "gotReply", replyType: "Interested" },
      { now: day(29) },
    );
    await snoozeLead(t.db, rep, reply.id, NOW);
    expect(await sectionOf("Reply Lead")).toBeNull();
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect((await buildToday(t.db, rep, tomorrow)).tasks[0]?.name).toBe("Reply Lead");
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
    for (const x of [a, b, c])
      await quickLog(
        t.db,
        rep,
        x.id,
        { action: "gotReply", replyType: "Interested" },
        { now: day(29) },
      );
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
