"use server";

// Server Actions for Plans (F17). Each: requireUser() → the permission check, guardrails and
// the change + writeAudit() inside the rules → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { planSchema } from "@/lib/validation/plans";
import type { Finding } from "../plans/guardrails";
import {
  createPlan,
  decidePlanProposal,
  duplicatePlan,
  PlanError,
  proposePlan,
  setPlanArchived,
  updatePlan,
} from "../plans/plans";

export type PlanResult = ActionResult & { findings?: Finding[] };

const idSchema = z.uuid();

async function run(work: () => Promise<PlanResult>): Promise<PlanResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof PlanError) return { ok: false, error: e.message, findings: e.findings };
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

export async function savePlan(id: string | null, input: unknown): Promise<PlanResult> {
  const viewer = await requireUser();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path[0] === "steps" ? `Step ${Number(issue.path[1]) + 1}: ` : "";
    return { ok: false, error: `${where}${issue.message}` };
  }
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Unknown plan." };
  return run(async () => {
    if (id === null) {
      const { plan, warnings } = await createPlan(getDb(), viewer, parsed.data);
      refresh();
      return {
        ok: true,
        message: `${plan.name} created.`,
        link: `/plans/${plan.id}`,
        findings: warnings,
      };
    }
    const { plan, warnings, newVersion } = await updatePlan(getDb(), viewer, id, parsed.data);
    refresh();
    return {
      ok: true,
      message: newVersion
        ? `Saved as version ${plan.currentVersion}. People already enrolled keep their version.`
        : `${plan.name} saved.`,
      link: `/plans/${plan.id}`,
      findings: warnings,
    };
  });
}

export async function duplicate(id: string): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Unknown plan." };
  return run(async () => {
    const row = await duplicatePlan(getDb(), viewer, id);
    refresh();
    return { ok: true, message: "Personal copy made.", link: `/plans/${row.id}` };
  });
}

export async function propose(id: string): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Unknown plan." };
  return run(async () => {
    await proposePlan(getDb(), viewer, id);
    refresh();
    return { ok: true, message: "Proposed as Official. An Admin will review it." };
  });
}

export async function archive(id: string, archived: boolean): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Unknown plan." };
  return run(async () => {
    await setPlanArchived(getDb(), viewer, id, archived);
    refresh();
    return { ok: true, message: archived ? "Plan archived." : "Plan restored." };
  });
}

export async function decide(
  id: string,
  decision: "Approved" | "Rejected",
  note: string,
): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(id).success || !["Approved", "Rejected"].includes(decision)) {
    return { ok: false, error: "Unknown plan." };
  }
  return run(async () => {
    await decidePlanProposal(getDb(), viewer, id, decision, note.slice(0, 1000));
    refresh();
    return {
      ok: true,
      message: decision === "Approved" ? "Approved: it's Official now." : "Rejected.",
    };
  });
}
