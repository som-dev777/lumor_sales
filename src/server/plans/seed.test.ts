import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plan, planStep, proposal } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { seedPlans } from "./seed";

let t: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeEach(async () => {
  t = await createTestDb();
  ownerId = (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id;
});
afterEach(() => t.cleanup());

describe("seed plans (F17, D-033)", () => {
  it("the Official Outreach plan has the PRD's 5 steps, 2 → 4 → 7 → 10 days apart", async () => {
    await seedPlans(t.db, ownerId);
    const [outreach] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
    expect(outreach).toMatchObject({
      type: "Official",
      planType: "Outreach",
      skipWeekends: true,
      currentVersion: 1,
    });
    const steps = await t.db
      .select()
      .from(planStep)
      .where(eq(planStep.planId, outreach.id))
      .orderBy(asc(planStep.stepOrder));
    expect(
      steps.map((s) => [
        s.stepOrder,
        s.channels.map((c) => `${c.channel}/${c.when}`),
        s.templatePurpose,
        s.waitDays,
      ]),
    ).toEqual([
      // Each step's days are the follow-up after it (D-060).
      [1, ["LinkedIn connection request/always"], null, 2],
      [2, ["LinkedIn message/always"], "Message 1", 4],
      [3, ["LinkedIn message/always"], "Follow-up 1", 7],
      [4, ["Call/phone", "Email/email", "LinkedIn message/always"], "Follow-up 2", 10],
      [5, ["LinkedIn message/always"], "Break-up", 0],
    ]);
    expect(steps[0].script).toBeNull(); // no note on the connection request
  });

  it("all four plans are ready to use, without (draft); running it again changes nothing", async () => {
    const first = await seedPlans(t.db, ownerId);
    expect(first.added).toEqual(["Official Outreach", "Meeting follow-up", "Trial", "Onboarding"]);
    const rows = await t.db.select().from(plan);
    expect(rows.every((d) => d.type === "Official" && d.proposalStatus === "None")).toBe(true);
    expect(await t.db.select().from(proposal)).toHaveLength(0);
    const again = await seedPlans(t.db, ownerId);
    expect(again).toEqual({ added: [], skipped: first.added });
  });
});
