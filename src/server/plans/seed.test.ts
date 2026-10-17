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
  it("the Official Outreach plan has the PRD's 5 steps, waits 2 → 4 → 7 → 10", async () => {
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
      [1, ["LinkedIn connection request/always"], null, 0],
      [2, ["LinkedIn message/always"], "Message 1", 2],
      [3, ["LinkedIn message/always"], "Follow-up 1", 4],
      [4, ["Call/phone", "Email/email", "LinkedIn message/always"], "Follow-up 2", 7],
      [5, ["LinkedIn message/always"], "Break-up", 10],
    ]);
    expect(steps[0].script).toBeNull(); // no note on the connection request
  });

  it("the three drafts wait in Approvals; running it again changes nothing", async () => {
    const first = await seedPlans(t.db, ownerId);
    expect(first.added).toHaveLength(4);
    const drafts = await t.db.select().from(plan).where(eq(plan.proposalStatus, "Proposed"));
    expect(drafts.map((d) => d.planType).sort()).toEqual([
      "Meeting follow-up",
      "Onboarding",
      "Trial",
    ]);
    expect(drafts.every((d) => d.type === "Personal")).toBe(true);
    expect(await t.db.select().from(proposal)).toHaveLength(3);
    const again = await seedPlans(t.db, ownerId);
    expect(again).toEqual({ added: [], skipped: first.added });
  });
});
