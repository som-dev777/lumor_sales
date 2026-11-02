import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { planSchema } from "@/lib/validation/plans";
import {
  createPlan,
  duplicatePlan,
  getPlan,
  listPlans,
  PlanError,
  setPlanArchived,
  stepsOf,
  updatePlan,
  usablePlans,
} from "./plans";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;
beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const step = (channel: string, waitDays: number, extra: Record<string, unknown> = {}) => ({
  channels: [{ channel, when: "always" }],
  waitDays,
  ...extra,
});
const outreach = (over: Record<string, unknown> = {}) =>
  planSchema.parse({
    name: "Fast outreach",
    planType: "Outreach",
    type: "Official",
    steps: [
      step("LinkedIn connection request", 0),
      step("LinkedIn message", 2, { templatePurpose: "Message 1" }),
      step("Email", 4),
      step("LinkedIn message", 7),
    ],
    ...over,
  });

describe("plans (F17)", () => {
  it("an Admin creates an Official plan; it's audited and listed for everyone", async () => {
    const { plan } = await createPlan(t.db, admin, outreach());
    expect(plan).toMatchObject({ type: "Official", currentVersion: 1, ownerId: admin.id });
    expect((await stepsOf(t.db, plan.id, 1)).map((s) => s.waitDays)).toEqual([0, 2, 4, 7]);
    expect((await t.db.select().from(auditLog)).at(-1)).toMatchObject({
      entityType: "Plan",
      action: "Created",
    });
    expect((await listPlans(t.db, rep, "official")).map((p) => p.name)).toEqual(["Fast outreach"]);
  });

  it("the builder refuses a plan that breaks a guardrail, with the reasons", async () => {
    const bad = outreach({
      steps: [step("LinkedIn connection request", 0), step("LinkedIn message", 0)],
    });
    const err = await createPlan(t.db, admin, bad).catch((e) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect(err.findings.map((f: { rule: number }) => f.rule)).toContain(1);
  });

  it("Users make Official and Personal plans (D-043), and edit only their own", async () => {
    const { plan: team } = await createPlan(t.db, rep, outreach({ name: "Team plan" }));
    expect(team).toMatchObject({ type: "Official", ownerId: rep.id });
    await expect(updatePlan(t.db, other, team.id, outreach())).rejects.toThrow(PermissionError);
    expect((await updatePlan(t.db, admin, team.id, outreach({ name: "Team" }))).plan.name).toBe(
      "Team",
    );
    const { plan } = await createPlan(t.db, rep, outreach({ type: "Personal", name: "Mine" }));
    await expect(updatePlan(t.db, other, plan.id, outreach({ type: "Personal" }))).rejects.toThrow(
      PermissionError,
    );
    expect(await getPlan(t.db, other, plan.id)).toBe("forbidden");
    expect((await getPlan(t.db, admin, plan.id)) !== "forbidden").toBe(true);
    expect((await listPlans(t.db, rep, "mine")).map((p) => p.name)).toEqual(["Mine"]);
  });

  it("changing the steps saves a new version; renaming alone doesn't", async () => {
    const { plan } = await createPlan(t.db, admin, outreach());
    const renamed = await updatePlan(t.db, admin, plan.id, outreach({ name: "Renamed" }));
    expect(renamed).toMatchObject({
      newVersion: false,
      plan: { currentVersion: 1, name: "Renamed" },
    });
    const changed = outreach({
      steps: [
        step("LinkedIn connection request", 0),
        step("LinkedIn message", 3),
        step("Email", 4),
        step("LinkedIn message", 7),
      ],
    });
    const v2 = await updatePlan(t.db, admin, plan.id, changed);
    expect(v2).toMatchObject({ newVersion: true, plan: { currentVersion: 2 } });
    expect((await stepsOf(t.db, plan.id, 1))[1].waitDays).toBe(2); // version 1 kept
    expect((await stepsOf(t.db, plan.id, 2))[1].waitDays).toBe(3);
  });

  it("duplicate makes a Personal copy; its creator can switch it to Official (D-043)", async () => {
    const { plan } = await createPlan(t.db, admin, outreach());
    const copy = await duplicatePlan(t.db, rep, plan.id);
    expect(copy).toMatchObject({ type: "Personal", ownerId: rep.id, name: "Fast outreach (copy)" });
    expect(await stepsOf(t.db, copy.id, 1)).toHaveLength(4);
    const { plan: shared } = await updatePlan(t.db, rep, copy.id, outreach({ name: copy.name }));
    expect(shared).toMatchObject({ type: "Official", ownerId: rep.id });
    expect((await usablePlans(t.db, other)).map((p) => p.id)).toContain(copy.id);
  });

  it("archived plans aren't offered for enrolment", async () => {
    const { plan } = await createPlan(t.db, rep, outreach({ type: "Personal", name: "Draft" }));
    expect((await usablePlans(t.db, rep)).map((p) => p.id)).toContain(plan.id);
    await setPlanArchived(t.db, rep, plan.id, true);
    expect((await usablePlans(t.db, rep)).map((p) => p.id)).not.toContain(plan.id);
  });

  it("a Custom task and a custom purpose are saved; a Custom task needs a name (D-043)", async () => {
    const bad = planSchema.safeParse({
      name: "No name",
      planType: "Trial",
      type: "Personal",
      steps: [step("Custom", 0)],
    });
    expect(bad.success).toBe(false);
    const data = outreach({
      planType: "Trial",
      steps: [
        {
          channels: [{ channel: "Custom", when: "always", label: "Send a case study" }],
          waitDays: 0,
        },
        step("LinkedIn message", 3, {
          templatePurpose: "Message 1",
          customPurpose: "Case study follow-up",
        }),
      ],
    });
    const { plan } = await createPlan(t.db, rep, data);
    const steps = await stepsOf(t.db, plan.id, 1);
    expect(steps[0].channels).toEqual([
      { channel: "Custom", when: "always", label: "Send a case study" },
    ]);
    // A custom purpose replaces the template purpose.
    expect(steps[1]).toMatchObject({
      customPurpose: "Case study follow-up",
      templatePurpose: null,
    });
  });
});
