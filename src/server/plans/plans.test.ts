import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, proposal } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { planSchema } from "@/lib/validation/plans";
import {
  createPlan,
  decidePlanProposal,
  duplicatePlan,
  getPlan,
  listPlans,
  PlanError,
  proposePlan,
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

  it("Users make Personal plans only, and edit only their own", async () => {
    await expect(createPlan(t.db, rep, outreach())).rejects.toThrow(PermissionError);
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

  it("duplicate makes a Personal copy; propose → Admin approves → Official and Admin-owned", async () => {
    const { plan } = await createPlan(t.db, admin, outreach());
    const copy = await duplicatePlan(t.db, rep, plan.id);
    expect(copy).toMatchObject({ type: "Personal", ownerId: rep.id, name: "Fast outreach (copy)" });
    expect(await stepsOf(t.db, copy.id, 1)).toHaveLength(4);
    await proposePlan(t.db, rep, copy.id);
    await expect(proposePlan(t.db, rep, copy.id)).rejects.toThrow(/already proposed/);
    expect((await usablePlans(t.db, rep)).map((p) => p.label)).not.toContain(
      "Fast outreach (copy) (Personal)",
    );
    await expect(decidePlanProposal(t.db, rep, copy.id, "Approved", null)).rejects.toThrow(
      PermissionError,
    );
    const approved = await decidePlanProposal(t.db, admin, copy.id, "Approved", null);
    expect(approved).toMatchObject({
      type: "Official",
      ownerId: admin.id,
      proposalStatus: "Approved",
    });
    expect((await t.db.select().from(proposal))[0]).toMatchObject({
      decision: "Approved",
      decidedBy: admin.id,
    });
  });

  it("rejecting needs a note; archived plans aren't offered for enrolment", async () => {
    const { plan } = await createPlan(t.db, rep, outreach({ type: "Personal", name: "Draft" }));
    await proposePlan(t.db, rep, plan.id);
    await expect(decidePlanProposal(t.db, admin, plan.id, "Rejected", " ")).rejects.toThrow(/why/);
    expect(await decidePlanProposal(t.db, admin, plan.id, "Rejected", "Too fast")).toMatchObject({
      proposalStatus: "Rejected",
    });
    expect((await usablePlans(t.db, rep)).map((p) => p.id)).toContain(plan.id);
    await setPlanArchived(t.db, rep, plan.id, true);
    expect((await usablePlans(t.db, rep)).map((p) => p.id)).not.toContain(plan.id);
  });
});
