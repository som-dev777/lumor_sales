"use server";

// Server Actions for Plans (F17). Each: requireUser() → the permission check, guardrails and
// the change + writeAudit() inside the rules → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { CALL_OUTCOMES } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { planSchema } from "@/lib/validation/plans";
import {
  completeStep,
  enrolPeople,
  finishPlan,
  GuardrailWarning,
  nurtureLost,
  pausePlan,
  resumePlan,
  snoozeStep,
  stopPlan,
  switchPlan,
  withdrawInvite,
} from "../plans/enrolment";
import type { Finding } from "../plans/guardrails";
import { LeadError } from "../leads/companies";
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
    if (e instanceof PermissionError || e instanceof LeadError)
      return { ok: false, error: e.message };
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

// --- Enrolment (person page, People, Today) ------------------------------------------------

export async function enrol(personIds: string[], planId: string): Promise<PlanResult> {
  const viewer = await requireUser();
  const ids = z.array(idSchema).min(1).max(500).safeParse(personIds);
  if (!ids.success || !idSchema.safeParse(planId).success) {
    return { ok: false, error: "Choose people and a plan." };
  }
  return run(async () => {
    const r = await enrolPeople(getDb(), viewer, ids.data, planId, await appNow());
    refresh();
    const skipped = r.skipped.length
      ? ` ${r.skipped.length} skipped: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`
      : "";
    return r.enrolled.length
      ? { ok: true, message: `${r.enrolled.length} enrolled.${skipped}` }
      : { ok: false, error: `Nobody enrolled.${skipped}` };
  });
}

const stepInputSchema = z.object({
  text: z.string().max(5000).nullish(),
  outcome: z.enum(CALL_OUTCOMES).optional(),
  callBackDate: z.string().max(10).optional(),
  override: z.boolean().optional(),
});

export type StepResult = PlanResult & { warnings?: { rule: number; message: string }[] };

export async function doStep(personId: string, input: unknown): Promise<StepResult> {
  const viewer = await requireUser();
  const parsed = stepInputSchema.safeParse(input);
  if (!idSchema.safeParse(personId).success || !parsed.success) {
    return { ok: false, error: "Check the step." };
  }
  try {
    const r = await completeStep(getDb(), viewer, personId, parsed.data, await appNow());
    refresh();
    return {
      ok: true,
      message: r.stopped ? "Logged. Their plan has stopped." : "Done. The next step is scheduled.",
    };
  } catch (e) {
    if (e instanceof GuardrailWarning) {
      return {
        ok: false,
        error: e.message,
        warnings: e.findings.map((f) => ({ rule: f.rule, message: f.message })),
      };
    }
    return run(async () => {
      throw e;
    });
  }
}

type PlanCommand =
  "pause" | "resume" | "stop" | "withdraw" | "nurture" | "lost" | "nurtureLost" | "snooze";

export async function planCommand(personId: string, command: PlanCommand): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  return run(async () => {
    const db = getDb();
    const now = await appNow();
    const messages: Record<PlanCommand, string> = {
      pause: "Plan paused.",
      resume: "Plan resumed. The step is due again.",
      stop: "Plan stopped.",
      withdraw: "Invite withdrawn. They're in Nurture for 60 days.",
      nurture: "Moved to Nurture: no touches for 60 days.",
      lost: "Marked Lost (No response).",
      nurtureLost: "Marked Lost (No response).",
      snooze: "Snoozed to tomorrow.",
    };
    if (command === "pause") await pausePlan(db, viewer, personId, now);
    else if (command === "resume") await resumePlan(db, viewer, personId, now);
    else if (command === "stop") await stopPlan(db, viewer, personId, "Stopped by the rep", now);
    else if (command === "withdraw") await withdrawInvite(db, viewer, personId, now);
    else if (command === "nurture") await finishPlan(db, viewer, personId, "nurture", now);
    else if (command === "lost") await finishPlan(db, viewer, personId, "lost", now);
    else if (command === "nurtureLost") await nurtureLost(db, viewer, personId, now);
    else if (command === "snooze") await snoozeStep(db, viewer, personId, now);
    else return { ok: false, error: "Unknown command." };
    refresh();
    return { ok: true, message: messages[command] };
  });
}

export async function switchTo(personId: string, planId: string): Promise<PlanResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(personId).success || !idSchema.safeParse(planId).success) {
    return { ok: false, error: "Choose a plan." };
  }
  return run(async () => {
    await switchPlan(getDb(), viewer, personId, planId, await appNow());
    refresh();
    return { ok: true, message: "Switched plan." };
  });
}
