// Plans (F17): create, edit (each save of the steps is a new version), duplicate, propose,
// archive, and decide proposals. Every change checks the shared permission rules and the
// cadence guardrails, and writes an audit entry in the same transaction.
import { and, asc, count, desc, eq, inArray, like, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  person,
  persona,
  plan,
  planEnrolment,
  planStep,
  proposal,
  template,
  user,
} from "@/lib/db/schema";
import { assertCan, can, type Actor } from "@/lib/permissions";
import type { PlanData, PlanStepData } from "@/lib/validation/plans";
import { getPlaybookSettings } from "../leads/quicklog";
import { checkPlan, type Finding } from "./guardrails";

export class PlanError extends Error {
  constructor(
    message: string,
    public findings: Finding[] = [],
  ) {
    super(message);
    this.name = "PlanError";
  }
}

export type PlanRow = typeof plan.$inferSelect;
export type StepRow = typeof planStep.$inferSelect;

export async function loadPlan(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(plan).where(eq(plan.id, id));
  if (!row) throw new PlanError("That plan doesn't exist.");
  return row;
}

export async function stepsOf(tx: DbOrTx, planId: string, version: number) {
  return tx
    .select()
    .from(planStep)
    .where(and(eq(planStep.planId, planId), eq(planStep.version, version)))
    .orderBy(asc(planStep.stepOrder));
}

/** The text guardrail 6 looks at: the step's fixed template, or the templates for its purpose. */
async function stepText(tx: DbOrTx, s: PlanStepData): Promise<string | null> {
  if (s.templateId) {
    const [t] = await tx
      .select({ body: template.body })
      .from(template)
      .where(eq(template.id, s.templateId));
    if (!t) throw new PlanError("A step uses a template that doesn't exist.");
    return t.body;
  }
  if (s.templatePurpose) {
    const rows = await tx
      .select({ body: template.body })
      .from(template)
      .where(and(eq(template.purpose, s.templatePurpose), eq(template.status, "Active")));
    return rows.map((r) => r.body).join("\n");
  }
  return null;
}

/** Runs the guardrails; throws if anything blocks. Returns the warnings to show. */
export async function guardPlan(tx: DbOrTx, data: Pick<PlanData, "planType" | "steps">) {
  const settings = await getPlaybookSettings(tx);
  const steps = await Promise.all(
    data.steps.map(async (s) => ({
      channels: s.channels,
      waitDays: s.waitDays,
      script: s.script,
      text: await stepText(tx, s),
    })),
  );
  const findings = checkPlan(data.planType, steps, settings);
  const blocks = findings.filter((f) => f.level === "block");
  if (blocks.length > 0) {
    throw new PlanError(blocks.map((f) => f.message).join(" "), findings);
  }
  return findings;
}

async function assertUsablePersona(tx: DbOrTx, personaId: string | null) {
  if (!personaId) return;
  const [row] = await tx
    .select({ status: persona.status })
    .from(persona)
    .where(eq(persona.id, personaId));
  if (!row) throw new PlanError("That persona doesn't exist.");
  if (row.status === "Archived") throw new PlanError("That persona is archived. Choose another.");
}

const stepValues = (planId: string, version: number, steps: PlanStepData[]) =>
  steps.map((s, i) => ({ ...s, planId, version, stepOrder: i + 1 }));

const sameSteps = (a: StepRow[], b: PlanStepData[]) =>
  a.length === b.length &&
  a.every(
    (s, i) =>
      JSON.stringify(s.channels) === JSON.stringify(b[i].channels) &&
      s.templatePurpose === b[i].templatePurpose &&
      (s.customPurpose ?? null) === (b[i].customPurpose ?? null) &&
      s.templateId === b[i].templateId &&
      (s.script ?? null) === (b[i].script ?? null) &&
      s.waitDays === b[i].waitDays,
  );

export async function createPlan(db: Db, actor: Actor, data: PlanData) {
  assertCan(actor, "plan.create", { type: data.type });
  return db.transaction(async (tx) => {
    await assertUsablePersona(tx, data.personaId);
    const warnings = await guardPlan(tx, data);
    const [row] = await tx
      .insert(plan)
      .values({
        name: data.name,
        planType: data.planType,
        personaId: data.personaId,
        type: data.type,
        ownerId: actor.id,
        skipWeekends: data.skipWeekends,
        currentVersion: 1,
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(planStep).values(stepValues(row.id, 1, data.steps));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: row.id,
      recordName: row.name,
      action: "Created",
      after: {
        name: row.name,
        planType: row.planType,
        type: row.type,
        steps: data.steps.length,
        version: 1,
      },
    });
    return { plan: row, warnings };
  });
}

/** Saves a plan. Changed steps become a new version; people enrolled keep theirs (PRD). */
export async function updatePlan(db: Db, actor: Actor, id: string, data: PlanData) {
  return db.transaction(async (tx) => {
    const before = await loadPlan(tx, id);
    assertCan(actor, "plan.edit", before);
    // No approvals (D-043): whoever may edit the plan may switch it between Personal and Official.
    if (data.type !== before.type) assertCan(actor, "plan.create", { type: data.type });
    await assertUsablePersona(tx, data.personaId);
    const warnings = await guardPlan(tx, data);
    const current = await stepsOf(tx, id, before.currentVersion);
    const version = sameSteps(current, data.steps)
      ? before.currentVersion
      : before.currentVersion + 1;
    if (version !== before.currentVersion) {
      await tx.insert(planStep).values(stepValues(id, version, data.steps));
    }
    const [after] = await tx
      .update(plan)
      .set({
        name: data.name,
        planType: data.planType,
        personaId: data.personaId,
        type: data.type,
        skipWeekends: data.skipWeekends,
        currentVersion: version,
      })
      .where(eq(plan.id, id))
      .returning();
    // Move the people on older versions to the new one, keeping their step and due date.
    let moved = 0;
    if (data.moveEnrolled && version !== before.currentVersion) {
      const live = await tx
        .select({ e: planEnrolment, name: person.fullName })
        .from(planEnrolment)
        .innerJoin(person, eq(person.id, planEnrolment.personId))
        .where(
          and(
            eq(planEnrolment.planId, id),
            inArray(planEnrolment.status, ["Active", "Paused"]),
            lt(planEnrolment.version, version),
          ),
        );
      for (const { e, name } of live) {
        await tx.update(planEnrolment).set({ version }).where(eq(planEnrolment.id, e.id));
        await writeAudit(tx, {
          userId: actor.id,
          entityType: "PlanEnrolment",
          recordId: e.id,
          recordName: name,
          action: "Updated",
          before: { version: e.version },
          after: { version, note: "moved to the new version of the plan" },
        });
        moved++;
      }
    }
    const fields = (r: PlanRow) => ({
      name: r.name,
      type: r.type,
      planType: r.planType,
      personaId: r.personaId,
      skipWeekends: r.skipWeekends,
      version: r.currentVersion,
    });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: fields(before),
      after: {
        ...fields(after),
        ...(version !== before.currentVersion ? { steps: data.steps.length } : {}),
      },
    });
    return { plan: after, warnings, newVersion: version !== before.currentVersion, moved };
  });
}

/** A Personal copy of any plan the user can see (current version's steps). */
export async function duplicatePlan(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const source = await loadPlan(tx, id);
    assertCan(actor, "plan.use", source);
    const steps = await stepsOf(tx, id, source.currentVersion);
    const [row] = await tx
      .insert(plan)
      .values({
        name: `${source.name} (copy)`.slice(0, 80),
        planType: source.planType,
        personaId: source.personaId,
        type: "Personal",
        ownerId: actor.id,
        skipWeekends: source.skipWeekends,
        currentVersion: 1,
        createdBy: actor.id,
      })
      .returning();
    if (steps.length) {
      await tx.insert(planStep).values(
        steps.map(({ id: _i, createdAt: _c, updatedAt: _u, createdBy: _b, ...s }) => ({
          ...s,
          planId: row.id,
          version: 1,
        })),
      );
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: row.id,
      recordName: row.name,
      action: "Created",
      after: { name: row.name, type: "Personal", copiedFrom: source.name, steps: steps.length },
    });
    return row;
  });
}

export async function proposePlan(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const before = await loadPlan(tx, id);
    assertCan(actor, "plan.propose", before);
    if (before.proposalStatus === "Proposed") throw new PlanError("This plan is already proposed.");
    if (before.status === "Archived") throw new PlanError("Restore the plan before proposing it.");
    await tx.insert(proposal).values({ itemType: "Plan", itemId: id, proposedBy: actor.id });
    const [after] = await tx
      .update(plan)
      .set({ proposalStatus: "Proposed" })
      .where(eq(plan.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: { proposalStatus: before.proposalStatus },
      after: { proposalStatus: after.proposalStatus },
    });
    return after;
  });
}

export async function setPlanArchived(db: Db, actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    const before = await loadPlan(tx, id);
    assertCan(actor, "plan.edit", before);
    const status = archived ? "Archived" : "Active";
    if (before.status === status) return before;
    const [after] = await tx.update(plan).set({ status }).where(eq(plan.id, id)).returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: id,
      recordName: after.name,
      action: "Updated",
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}

/** Admin decides a plan proposal: Approve makes it Official and Admin-owned (F07 rules). */
export async function decidePlanProposal(
  db: Db,
  actor: Actor,
  planId: string,
  decision: "Approved" | "Rejected",
  note: string | null,
) {
  assertCan(actor, "proposal.decide");
  if (decision === "Rejected" && !note?.trim()) throw new PlanError("Say why it's rejected.");
  return db.transaction(async (tx) => {
    const before = await loadPlan(tx, planId);
    const [pending] = await tx
      .select()
      .from(proposal)
      .where(
        and(
          eq(proposal.itemType, "Plan"),
          eq(proposal.itemId, planId),
          eq(proposal.decision, "Pending"),
        ),
      );
    if (!pending) throw new PlanError("There's no pending proposal for this plan.");
    if (decision === "Approved" && before.status === "Archived") {
      throw new PlanError("This plan was archived. It can't be approved.");
    }
    if (decision === "Approved") {
      // Approving a plan with blocking guardrail problems would put them in front of everyone.
      const steps = await stepsOf(tx, planId, before.currentVersion);
      await guardPlan(tx, { planType: before.planType, steps });
    }
    await tx
      .update(proposal)
      .set({
        decision,
        decidedBy: actor.id,
        decidedAt: new Date(),
        reviewerNote: note?.trim() || null,
      })
      .where(eq(proposal.id, pending.id));
    const [after] = await tx
      .update(plan)
      .set(
        decision === "Approved"
          ? { type: "Official", ownerId: actor.id, proposalStatus: "Approved" }
          : { proposalStatus: "Rejected" },
      )
      .where(eq(plan.id, planId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: planId,
      recordName: after.name,
      action: decision,
      before: { type: before.type, ownerId: before.ownerId, proposalStatus: before.proposalStatus },
      after: {
        type: after.type,
        ownerId: after.ownerId,
        proposalStatus: after.proposalStatus,
        ...(note?.trim() ? { reviewerNote: note.trim() } : {}),
      },
    });
    return after;
  });
}

/**
 * Delete a plan (D-045; replaces Archive). A plan nobody was ever on is removed for good. One
 * with history is taken out of every list and its live enrolments stop ("Plan deleted"), so
 * people's timelines keep what happened. Audited either way.
 */
export async function deletePlan(db: Db, actor: Actor, id: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const before = await loadPlan(tx, id);
    assertCan(actor, "plan.edit", before);
    const [{ n: used }] = await tx
      .select({ n: count() })
      .from(planEnrolment)
      .where(eq(planEnrolment.planId, id));
    if (used === 0) {
      await tx.delete(planStep).where(eq(planStep.planId, id));
      await tx.delete(plan).where(eq(plan.id, id));
    } else {
      const live = await tx
        .select({ e: planEnrolment, name: person.fullName })
        .from(planEnrolment)
        .innerJoin(person, eq(person.id, planEnrolment.personId))
        .where(
          and(eq(planEnrolment.planId, id), inArray(planEnrolment.status, ["Active", "Paused"])),
        );
      for (const { e, name } of live) {
        await tx
          .update(planEnrolment)
          .set({ status: "Stopped", endedAt: now, endReason: "Plan deleted", nextDueDate: null })
          .where(eq(planEnrolment.id, e.id));
        await writeAudit(tx, {
          userId: actor.id,
          entityType: "PlanEnrolment",
          recordId: e.id,
          recordName: name,
          action: "Updated",
          before: { status: e.status },
          after: { status: "Stopped", endReason: "Plan deleted" },
        });
      }
      await tx.update(plan).set({ status: "Archived" }).where(eq(plan.id, id));
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Plan",
      recordId: id,
      recordName: before.name,
      action: "Deleted",
      before: { name: before.name, type: before.type, planType: before.planType },
      after: used === 0 ? undefined : { keptForHistory: true, enrolments: used },
    });
    return { removed: used === 0 };
  });
}

// --- Reading -----------------------------------------------------------------------------------

const owner = alias(user, "plan_owner");

export type PlanTab = "official" | "mine" | "all";

/** Plans to list (D-045): "all" = every plan you can use; "mine" = the ones you made. */
export async function listPlans(db: DbOrTx, viewer: Actor, tab: PlanTab, q?: string) {
  const visible = and(
    // Deleted plans with history are kept out of every list.
    eq(plan.status, "Active"),
    tab === "official"
      ? eq(plan.type, "Official")
      : tab === "mine"
        ? eq(plan.ownerId, viewer.id)
        : viewer.role === "Admin"
          ? undefined
          : or(eq(plan.type, "Official"), eq(plan.ownerId, viewer.id)),
  );
  const rows = await db
    .select({
      plan,
      ownerName: owner.name,
      personaName: persona.name,
    })
    .from(plan)
    .leftJoin(owner, eq(owner.id, plan.ownerId))
    .leftJoin(persona, eq(persona.id, plan.personaId))
    .where(and(visible, q ? like(plan.name, `%${q.replace(/[%_]/g, "")}%`) : undefined))
    .orderBy(asc(plan.status), desc(plan.type), asc(plan.name));
  const ids = rows.map((r) => r.plan.id);
  const [stepCounts, enrolled] = ids.length
    ? await Promise.all([
        db
          .select({ planId: planStep.planId, version: planStep.version, n: count() })
          .from(planStep)
          .where(inArray(planStep.planId, ids))
          .groupBy(planStep.planId, planStep.version),
        db
          .select({ planId: planEnrolment.planId, n: count() })
          .from(planEnrolment)
          .where(
            and(
              inArray(planEnrolment.planId, ids),
              inArray(planEnrolment.status, ["Active", "Paused"]),
            ),
          )
          .groupBy(planEnrolment.planId),
      ])
    : [[], []];
  return rows.map((r) => ({
    ...r.plan,
    ownerName: r.ownerName,
    personaName: r.personaName,
    steps:
      stepCounts.find((s) => s.planId === r.plan.id && s.version === r.plan.currentVersion)?.n ?? 0,
    enrolled: enrolled.find((e) => e.planId === r.plan.id)?.n ?? 0,
  }));
}

export async function getPlan(db: DbOrTx, viewer: Actor, id: string) {
  const [row] = await db
    .select({ plan, ownerName: owner.name, personaName: persona.name })
    .from(plan)
    .leftJoin(owner, eq(owner.id, plan.ownerId))
    .leftJoin(persona, eq(persona.id, plan.personaId))
    .where(eq(plan.id, id));
  // A deleted plan with history (D-045) no longer opens.
  if (!row || row.plan.status === "Archived") return null;
  if (!can(viewer, "plan.use", row.plan)) return "forbidden" as const;
  const steps = await stepsOf(db, id, row.plan.currentVersion);
  const [{ n: enrolled }] = await db
    .select({ n: count() })
    .from(planEnrolment)
    .where(and(eq(planEnrolment.planId, id), inArray(planEnrolment.status, ["Active", "Paused"])));
  const settings = await getPlaybookSettings(db);
  const findings = checkPlan(
    row.plan.planType,
    await Promise.all(
      steps.map(async (s) => ({
        channels: s.channels,
        waitDays: s.waitDays,
        script: s.script,
        text: await stepText(db, s),
      })),
    ),
    settings,
  );
  const [pendingProposal] = await db
    .select()
    .from(proposal)
    .where(
      and(eq(proposal.itemType, "Plan"), eq(proposal.itemId, id), eq(proposal.decision, "Pending")),
    );
  return {
    ...row.plan,
    ownerName: row.ownerName,
    personaName: row.personaName,
    steps,
    enrolled,
    findings,
    pendingProposal: pendingProposal ?? null,
  };
}

/** Plans a user may enrol people in: Active, and Official or theirs (Admins: all). */
export async function usablePlans(db: DbOrTx, viewer: Actor) {
  const rows = await db
    .select()
    .from(plan)
    .where(eq(plan.status, "Active"))
    .orderBy(desc(plan.type), asc(plan.name));
  return rows
    .filter((p) => can(viewer, "plan.use", p))
    .map((p) => ({
      id: p.id,
      label: `${p.name}${p.type === "Personal" ? " (Personal)" : ""}`,
      planType: p.planType,
    }));
}
