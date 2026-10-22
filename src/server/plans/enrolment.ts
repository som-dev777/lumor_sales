// Plan enrolment (F17): enrol people, do steps, follow acceptance, pause on replies, resume,
// switch, stop, withdraw, finish and Nurture. Each change checks permissions (the lead's owner
// or an Admin, plus a plan they can use), the cadence guardrails, and writes its activity and
// audit entry in one transaction.
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { CallOutcome } from "@/lib/db/enums";
import { activity, company, person, planEnrolment, template, user } from "@/lib/db/schema";
import { assertCan, can, type Actor } from "@/lib/permissions";
import { addDaysIst, toIstDate, todayIst } from "@/lib/time";
import { placeholdersIn } from "@/lib/validation/library";
import { LeadError } from "../leads/companies";
import { loadPerson } from "../leads/people";
import {
  getPlaybookSettings,
  OUTREACH_ACTIONS,
  quickLogTx,
  type MessageChannel,
  type QuickLog,
} from "../leads/quicklog";
import { checkTouch, type Finding, type HistoryItem, type TouchKind } from "./guardrails";
import { loadPlan, PlanError, stepsOf, type StepRow } from "./plans";
import {
  dueAfter,
  endsByFrom,
  extendBy,
  fitWeeklyLimit,
  isSenior,
  nextBusinessDay,
  resolveChannel,
  rollOffWeekend,
  daysBetween,
} from "./schedule";

type EnrolmentRow = typeof planEnrolment.$inferSelect;
type PersonRow = typeof person.$inferSelect;

/** Warnings the rep must confirm ("Log anyway?") before the touch is logged. */
export class GuardrailWarning extends Error {
  constructor(public findings: Finding[]) {
    super(findings.map((f) => f.message).join(" "));
    this.name = "GuardrailWarning";
  }
}

// --- Reading ---------------------------------------------------------------------------------

export async function liveEnrolment(tx: DbOrTx, personId: string) {
  const [row] = await tx
    .select()
    .from(planEnrolment)
    .where(
      and(
        eq(planEnrolment.personId, personId),
        inArray(planEnrolment.status, ["Active", "Paused"]),
      ),
    );
  return row ?? null;
}

/** The person's outreach history, as the guardrails read it. */
export async function touchHistory(tx: DbOrTx, personId: string): Promise<HistoryItem[]> {
  const rows = await tx
    .select({
      type: activity.type,
      at: activity.occurredAt,
      requestNote: activity.requestNote,
      outcome: activity.callOutcome,
    })
    .from(activity)
    .where(eq(activity.personId, personId))
    .orderBy(asc(activity.occurredAt));
  const out: HistoryItem[] = [];
  for (const r of rows) {
    const date = toIstDate(r.at);
    if (r.type === "Request sent") out.push({ date, kind: "request", withNote: r.requestNote });
    else if (r.type === "Message sent" || r.type === "InMail sent")
      out.push({ date, kind: "message" });
    else if (r.type === "Call")
      out.push({ date, kind: "call", connected: r.outcome === "Connected" });
    else if (r.type === "Reply received") out.push({ date, kind: "reply" });
    else if (r.type === "Request accepted") out.push({ date, kind: "accepted" });
  }
  return out;
}

/** Dates of touches since the last reply (for the weekly limit when scheduling). */
function touchDates(history: HistoryItem[]): string[] {
  const lastReply = history.map((h) => h.kind).lastIndexOf("reply");
  return history
    .slice(lastReply + 1)
    .filter(
      (h) =>
        (h.kind === "request" && h.withNote) ||
        h.kind === "message" ||
        (h.kind === "call" && h.connected),
    )
    .map((h) => h.date);
}

/** The best active template for a step and person (D-034): persona and level, Official first. */
export async function templateFor(
  tx: DbOrTx,
  step: StepRow,
  p: Pick<PersonRow, "personaId" | "level">,
) {
  if (step.templateId) {
    const [t] = await tx.select().from(template).where(eq(template.id, step.templateId));
    return t ?? null;
  }
  if (!step.templatePurpose) return null;
  const rows = await tx
    .select()
    .from(template)
    .where(and(eq(template.purpose, step.templatePurpose), eq(template.status, "Active")));
  const score = (t: (typeof rows)[number]) =>
    (p.personaId && t.personaId === p.personaId ? 4 : t.personaId ? -2 : 0) +
    (p.level && t.level === p.level ? 2 : t.level === "Any" ? 1 : 0) +
    (t.type === "Official" ? 1 : 0);
  return rows.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Fills the placeholders we know from the person ({Name}, {First name}, {Company}…). */
export function fillPlaceholders(
  body: string,
  values: {
    fullName: string;
    title: string | null;
    company: string | null;
    repName: string | null;
  },
): string {
  const first = values.fullName.split(/\s+/)[0];
  const map: Record<string, string | null> = {
    name: first,
    "first name": first,
    "full name": values.fullName,
    company: values.company,
    title: values.title,
    "my name": values.repName,
  };
  return body.replace(
    /\{([^{}\n]{1,40})\}/g,
    (whole, key: string) => map[key.trim().toLowerCase()] ?? whole,
  );
}

export type PlanState = Awaited<ReturnType<typeof planState>>;

/** Everything the person page and Today need about a person's plan. */
export async function planState(db: DbOrTx, personId: string, today: string) {
  const e = await liveEnrolment(db, personId);
  if (!e) return null;
  const [p] = await db.select().from(person).where(eq(person.id, personId));
  const pl = await loadPlan(db, e.planId);
  const steps = await stepsOf(db, e.planId, e.version);
  const step = steps[e.currentStep - 1] ?? null;
  const channel = step ? resolveChannel(step.channels, p) : null;
  const finished = !step || (e.endsBy !== null && e.endsBy < today);
  let message: string | null = null;
  let templateId: string | null = null;
  if (
    step &&
    channel &&
    channel !== "Call" &&
    channel !== "Manual task" &&
    channel !== "LinkedIn connection request"
  ) {
    const t = await templateFor(db, step, p);
    templateId = t?.id ?? null;
    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, p.ownerId));
    const companyName = await companyNameOf(db, p.companyId);
    message = t
      ? fillPlaceholders(t.body, {
          fullName: p.fullName,
          title: p.title,
          company: companyName,
          repName: owner?.name ?? null,
        })
      : (step.script ?? "");
  }
  return {
    enrolment: e,
    plan: pl,
    steps,
    step,
    channel,
    message,
    templateId,
    finished,
    overdue:
      !finished &&
      e.status === "Active" &&
      !e.waitingForAcceptance &&
      e.nextDueDate !== null &&
      e.nextDueDate < today,
    dueToday:
      !finished && e.status === "Active" && !e.waitingForAcceptance && e.nextDueDate === today,
    withdrawDue:
      e.status === "Active" &&
      e.waitingForAcceptance &&
      e.nextDueDate !== null &&
      e.nextDueDate <= today,
  };
}

async function companyNameOf(db: DbOrTx, companyId: string | null) {
  if (!companyId) return null;
  const [c] = await db
    .select({ name: company.name })
    .from(company)
    .where(eq(company.id, companyId));
  return c?.name ?? null;
}

// --- Writing helpers -------------------------------------------------------------------------

async function updateEnrolment(
  tx: DbOrTx,
  actor: Actor,
  before: EnrolmentRow,
  values: Partial<typeof planEnrolment.$inferInsert>,
  personName: string,
  note?: string,
) {
  const [after] = await tx
    .update(planEnrolment)
    .set(values)
    .where(eq(planEnrolment.id, before.id))
    .returning();
  const fields = (r: EnrolmentRow) => ({
    status: r.status,
    currentStep: r.currentStep,
    nextDueDate: r.nextDueDate,
    waitingForAcceptance: r.waitingForAcceptance,
    endsBy: r.endsBy,
    endReason: r.endReason,
  });
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "PlanEnrolment",
    recordId: before.id,
    recordName: personName,
    action: "Updated",
    before: fields(before),
    after: { ...fields(after), ...(note ? { note } : {}) },
  });
  return after;
}

async function logPlanEvent(
  tx: DbOrTx,
  actor: Actor,
  p: PersonRow,
  enrolmentId: string,
  content: string,
  now: Date,
) {
  await tx.insert(activity).values({
    personId: p.id,
    companyId: p.companyId,
    userId: actor.id,
    createdBy: actor.id,
    occurredAt: now,
    type: "Plan change",
    channel: "LinkedIn",
    content,
    planEnrolmentId: enrolmentId,
  });
}

/** When the next step is due, after a step was done (or the plan started) on `from`. */
async function scheduleNext(
  tx: DbOrTx,
  personId: string,
  from: string,
  step: StepRow,
  skipWeekends: boolean,
) {
  const settings = await getPlaybookSettings(tx);
  const history = await touchHistory(tx, personId);
  return fitWeeklyLimit(
    dueAfter(from, step.waitDays, skipWeekends),
    touchDates(history),
    settings.weeklyTouchLimit,
    skipWeekends,
  );
}

async function limitDays(tx: DbOrTx, p: PersonRow) {
  const s = await getPlaybookSettings(tx);
  return isSenior(p.seniority) ? s.outreachMaxDaysSenior : s.outreachMaxDays;
}

// --- Enrolling --------------------------------------------------------------------------------

export type EnrolResult = { enrolled: string[]; skipped: { name: string; reason: string }[] };

/** Enrol one or many people in a plan. People who can't be enrolled are skipped, with why. */
export async function enrolPeople(
  db: Db,
  actor: Actor,
  personIds: string[],
  planId: string,
  now = new Date(),
): Promise<EnrolResult> {
  const result: EnrolResult = { enrolled: [], skipped: [] };
  const pl = await loadPlan(db, planId);
  assertCan(actor, "plan.use", pl);
  if (pl.status !== "Active") throw new PlanError("That plan is archived.");
  if (pl.proposalStatus === "Proposed") throw new PlanError("That plan is waiting for approval.");
  const steps = await stepsOf(db, planId, pl.currentVersion);
  if (steps.length === 0) throw new PlanError("That plan has no steps.");
  const today = todayIst(now);

  for (const id of personIds) {
    await db.transaction(async (tx) => {
      const p = await loadPerson(tx, id);
      const skip = (reason: string) => result.skipped.push({ name: p.fullName, reason });
      if (!can(actor, "lead.edit", p)) return skip("not your lead");
      if (p.doNotContact) return skip("Do not contact");
      if (p.stage === "Lost") return skip("marked Lost");
      if (pl.planType === "Outreach" && p.nurtureUntil && p.nurtureUntil > today) {
        return skip(`in Nurture until ${p.nurtureUntil}`);
      }
      if (await liveEnrolment(tx, id)) return skip("already on a plan");
      const [row] = await tx
        .insert(planEnrolment)
        .values({
          personId: id,
          planId,
          version: pl.currentVersion,
          status: "Active",
          currentStep: 1,
          nextDueDate: await scheduleNext(tx, id, today, steps[0], pl.skipWeekends),
          startedAt: now,
          createdBy: actor.id,
        })
        .returning();
      if (p.nurtureUntil && p.nurtureUntil <= today) {
        await tx.update(person).set({ nurtureUntil: null }).where(eq(person.id, id));
      }
      await logPlanEvent(
        tx,
        actor,
        p,
        row.id,
        `Enrolled in ${pl.name} (version ${pl.currentVersion})`,
        now,
      );
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "PlanEnrolment",
        recordId: row.id,
        recordName: p.fullName,
        action: "Created",
        after: {
          plan: pl.name,
          version: pl.currentVersion,
          status: "Active",
          nextDueDate: row.nextDueDate,
        },
      });
      result.enrolled.push(p.fullName);
    });
  }
  return result;
}

// --- Doing a step -----------------------------------------------------------------------------

export type StepInput = {
  /** The final message text, for message steps. */
  text?: string | null;
  outcome?: CallOutcome;
  callBackDate?: string;
  /** The rep confirmed "Log anyway?" on guardrail warnings. */
  override?: boolean;
};

const QUICKLOG_CHANNEL: Record<string, MessageChannel> = {
  "LinkedIn message": "LinkedIn",
  InMail: "InMail",
  Email: "Email",
  WhatsApp: "WhatsApp",
};

/** Throws on blocks; throws GuardrailWarning on warnings unless overridden. Returns overrides. */
async function guardTouch(
  tx: DbOrTx,
  p: PersonRow,
  touch: { kind: TouchKind; withNote?: boolean; connected?: boolean },
  today: string,
  override: boolean,
) {
  const settings = await getPlaybookSettings(tx);
  const findings = checkTouch(
    {
      today,
      touch,
      history: await touchHistory(tx, p.id),
      doNotContact: p.doNotContact,
      nurtureUntil: p.nurtureUntil,
    },
    settings,
  );
  const blocks = findings.filter((f) => f.level === "block");
  if (blocks.length) throw new LeadError(blocks.map((f) => f.message).join(" "));
  const warns = findings.filter((f) => f.level === "warn");
  if (warns.length && !override) throw new GuardrailWarning(warns);
  return warns.map((f) => f.rule);
}

/** Does the person's current plan step (Today's Done, the Plan panel, or quick-log "Yes"). */
export async function completeStep(
  db: Db,
  actor: Actor,
  personId: string,
  input: StepInput,
  now = new Date(),
) {
  return db.transaction((tx) => completeStepTx(tx, actor, personId, input, now));
}

export async function completeStepTx(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  input: StepInput,
  now: Date,
) {
  const p = await loadPerson(tx, personId);
  assertCan(actor, "lead.edit", p);
  const e = await liveEnrolment(tx, personId);
  if (!e || e.status !== "Active")
    throw new PlanError("There's no active plan step for this person.");
  if (e.waitingForAcceptance)
    throw new PlanError("Waiting for them to accept the connection request first.");
  const pl = await loadPlan(tx, e.planId);
  const steps = await stepsOf(tx, e.planId, e.version);
  const step = steps[e.currentStep - 1];
  if (!step) throw new PlanError("All steps are done. Choose Nurture or Lost.");
  const today = todayIst(now);
  const channel = resolveChannel(step.channels, p);
  const link = { planEnrolmentId: e.id, planStepOrder: step.stepOrder };
  const settings = await getPlaybookSettings(tx);
  let overrides: number[] = [];
  let advance = true;
  let extra: Partial<typeof planEnrolment.$inferInsert> = {};
  let next: string | null = null;

  if (channel === "LinkedIn connection request") {
    const withNote = Boolean(step.script?.trim());
    overrides = await guardTouch(
      tx,
      p,
      { kind: "request", withNote },
      today,
      Boolean(input.override),
    );
    await quickLogTx(
      tx,
      actor,
      personId,
      { action: "requestSent", withNote },
      { now, activityExtra: link },
    );
    extra = { waitingForAcceptance: true, requestSentDate: today };
    next = addDaysIst(today, settings.withdrawAfterDays); // the withdraw task's date
  } else if (channel === "Call") {
    const outcome = input.outcome;
    if (!outcome) throw new PlanError("Choose the call outcome.");
    overrides = await guardTouch(
      tx,
      p,
      { kind: "call", connected: outcome === "Connected" },
      today,
      Boolean(input.override),
    );
    await quickLogTx(
      tx,
      actor,
      personId,
      { action: "callLogged", outcome },
      { now, note: input.text, activityExtra: link },
    );
    if (outcome === "No answer" && e.callAttempts < 2) {
      advance = false;
      extra = { callAttempts: e.callAttempts + 1 };
      next = nextBusinessDay(today);
    } else if (outcome === "Call back later") {
      if (!input.callBackDate || input.callBackDate < today)
        throw new PlanError("Pick the date to call back.");
      advance = false;
      next = rollOffWeekend(input.callBackDate, pl.skipWeekends);
    } else if (outcome === "Wrong number") {
      if (p.phone) {
        await tx.update(person).set({ phone: null }).where(eq(person.id, personId));
        await writeAudit(tx, {
          userId: actor.id,
          entityType: "Person",
          recordId: personId,
          recordName: p.fullName,
          action: "Updated",
          before: { phone: p.phone },
          after: { phone: null, reason: "Wrong number" },
        });
      }
    } else if (outcome === "Not interested") {
      await updateEnrolment(
        tx,
        actor,
        e,
        { status: "Stopped", endedAt: now, endReason: "Not interested", nextDueDate: null },
        p.fullName,
      );
      await logPlanEvent(tx, actor, p, e.id, `${pl.name} stopped: not interested`, now);
      return { stopped: true as const, overrides };
    }
  } else if (channel === "Manual task") {
    await tx.insert(activity).values({
      personId,
      companyId: p.companyId,
      userId: actor.id,
      createdBy: actor.id,
      occurredAt: now,
      type: "Task done",
      channel: "LinkedIn",
      content: [step.script, input.text?.trim()].filter(Boolean).join(" — ") || "Task done",
      ...link,
    });
  } else {
    const text = input.text?.trim() ?? "";
    if (!text) throw new PlanError("Write the message you sent.");
    const missing = placeholdersIn(text);
    if (missing.length) throw new PlanError(`Fill in {${missing[0]}} first.`);
    overrides = await guardTouch(tx, p, { kind: "message" }, today, Boolean(input.override));
    const t = await templateFor(tx, step, p);
    await quickLogTx(
      tx,
      actor,
      personId,
      {
        action: "messageSent",
        channel: QUICKLOG_CHANNEL[channel] ?? "LinkedIn",
        templateId: t?.id ?? null,
      },
      { now, note: text, activityExtra: link },
    );
  }

  if (advance) {
    const nextStep = steps[e.currentStep]; // the step after this one
    extra = { ...extra, currentStep: e.currentStep + 1, callAttempts: 0 };
    if (channel !== "LinkedIn connection request") {
      next = nextStep ? await scheduleNext(tx, personId, today, nextStep, pl.skipWeekends) : null;
    }
    // ends_by starts at the first touch when the plan doesn't begin with a connection request.
    if (
      !e.endsBy &&
      pl.planType === "Outreach" &&
      channel !== "LinkedIn connection request" &&
      !e.requestSentDate
    ) {
      extra.endsBy = endsByFrom(today, await limitDays(tx, p));
    }
  }
  const after = await updateEnrolment(
    tx,
    actor,
    e,
    { ...extra, nextDueDate: next },
    p.fullName,
    overrides.length ? `logged despite guardrail ${overrides.join(", ")}` : undefined,
  );
  return { stopped: false as const, enrolment: after, overrides };
}

// --- Events from quick-log ---------------------------------------------------------------------

/** Accepted: the step after the connection request is due on acceptance + its wait. */
async function onAccepted(tx: DbOrTx, actor: Actor, p: PersonRow, today: string) {
  const e = await liveEnrolment(tx, p.id);
  if (!e || !e.waitingForAcceptance) return;
  const pl = await loadPlan(tx, e.planId);
  const steps = await stepsOf(tx, e.planId, e.version);
  const step = steps[e.currentStep - 1];
  await updateEnrolment(
    tx,
    actor,
    e,
    {
      waitingForAcceptance: false,
      acceptedDate: today,
      endsBy: pl.planType === "Outreach" ? endsByFrom(today, await limitDays(tx, p)) : e.endsBy,
      nextDueDate: step ? await scheduleNext(tx, p.id, today, step, pl.skipWeekends) : null,
    },
    p.fullName,
  );
}

/** Any logged reply pauses the plan (PRD), and is linked to the step before it. */
async function onReply(tx: DbOrTx, actor: Actor, p: PersonRow, replyActivityId: string, now: Date) {
  const e = await liveEnrolment(tx, p.id);
  if (!e || e.status !== "Active") return;
  // A reply from before the plan started is history (F18: pasted conversations).
  if (e.startedAt && e.startedAt > now) return;
  await tx
    .update(activity)
    .set({ planEnrolmentId: e.id, planStepOrder: Math.max(1, e.currentStep - 1) })
    .where(eq(activity.id, replyActivityId));
  await updateEnrolment(
    tx,
    actor,
    e,
    { status: "Paused", pausedAt: now },
    p.fullName,
    "paused by a reply",
  );
  const pl = await loadPlan(tx, e.planId);
  await logPlanEvent(tx, actor, p, e.id, `${pl.name} paused: they replied`, now);
}

/**
 * After a reply (F17 + F18): the plan pauses from the reply's time, and if it's the latest
 * message in the conversation, the reply-by date and the nudge count reset.
 */
export async function afterReply(
  tx: DbOrTx,
  actor: Actor,
  p: PersonRow,
  reply: { id: string; occurredAt: Date },
) {
  const [later] = await tx
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.personId, p.id),
        eq(activity.direction, "out"),
        gt(activity.occurredAt, reply.occurredAt),
      ),
    )
    .limit(1);
  if (!later && (p.awaitingReplyUntil || p.nudgeCount)) {
    await tx
      .update(person)
      .set({ awaitingReplyUntil: null, nudgeCount: 0 })
      .where(eq(person.id, p.id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: p.id,
      recordName: p.fullName,
      action: "Updated",
      before: { awaitingReplyUntil: p.awaitingReplyUntil, nudgeCount: p.nudgeCount },
      after: { awaitingReplyUntil: null, nudgeCount: 0, reason: "they replied" },
    });
  }
  await onReply(tx, actor, p, reply.id, reply.occurredAt);
}

const ACTION_KIND: Partial<Record<QuickLog["action"], TouchKind>> = {
  requestSent: "request",
  messageSent: "message",
  callLogged: "call",
};

/**
 * Every quick-log goes through here (F15 + F17): outreach is checked by the guardrails, "Yes,
 * this is step N" does the plan step instead, and acceptances and replies update the plan.
 */
export async function logWithPlan(
  db: Db,
  actor: Actor,
  personId: string,
  log: QuickLog,
  opts: LogOptions = {},
) {
  return db.transaction((tx) => logWithPlanTx(tx, actor, personId, log, opts));
}

type LogOptions = {
  note?: string | null;
  now?: Date;
  asStep?: boolean;
  override?: boolean;
  /** Something that already happened on an earlier day (F18): no guardrail warnings. */
  history?: boolean;
};

/** logWithPlan inside an open transaction (the conversation thread uses it too, F18). */
export async function logWithPlanTx(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  log: QuickLog,
  opts: LogOptions = {},
) {
  const now = opts.now ?? new Date();
  if (opts.asStep) {
    const text = log.action === "messageSent" ? (opts.note ?? "") : opts.note;
    await completeStepTx(
      tx,
      actor,
      personId,
      {
        text: text || null,
        outcome: log.action === "callLogged" ? log.outcome : undefined,
        override: opts.override || opts.history,
      },
      now,
    );
    return { person: await loadPerson(tx, personId), activity: null };
  }
  const p = await loadPerson(tx, personId);
  assertCan(actor, "lead.edit", p);
  const kind = ACTION_KIND[log.action];
  let overrides: number[] = [];
  if (kind && OUTREACH_ACTIONS.includes(log.action) && !opts.history) {
    overrides = await guardTouch(
      tx,
      p,
      {
        kind,
        withNote: log.action === "requestSent" ? Boolean(log.withNote) : undefined,
        connected: log.action === "callLogged" ? log.outcome === "Connected" : undefined,
      },
      todayIst(now),
      Boolean(opts.override),
    );
  }
  const done = await quickLogTx(tx, actor, personId, log, { note: opts.note, now });
  if (overrides.length) {
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: done.activity.id,
      recordName: `${done.activity.type} to ${p.fullName}`,
      action: "Created",
      after: { type: done.activity.type, guardrailOverride: overrides.join(", ") },
    });
  }
  if (log.action === "accepted") await onAccepted(tx, actor, done.person, todayIst(now));
  if (log.action === "gotReply") await afterReply(tx, actor, done.person, done.activity);
  return done;
}

// --- Pause, resume, switch, stop, withdraw, finish, Nurture, snooze ---------------------------

async function loadLive(tx: DbOrTx, actor: Actor, personId: string) {
  const p = await loadPerson(tx, personId);
  assertCan(actor, "lead.edit", p);
  const e = await liveEnrolment(tx, personId);
  if (!e) throw new PlanError("This person isn't on a plan.");
  return { p, e, pl: await loadPlan(tx, e.planId) };
}

export async function pausePlan(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { p, e, pl } = await loadLive(tx, actor, personId);
    if (e.status === "Paused") return e;
    const after = await updateEnrolment(
      tx,
      actor,
      e,
      { status: "Paused", pausedAt: now },
      p.fullName,
    );
    await logPlanEvent(tx, actor, p, e.id, `${pl.name} paused`, now);
    return after;
  });
}

/** Resume: the current step is due today (a weekday, within the guardrails); ends_by moves on. */
export async function resumePlan(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { p, e, pl } = await loadLive(tx, actor, personId);
    if (e.status !== "Paused") return e;
    if (p.doNotContact) throw new PlanError("This person is marked Do not contact.");
    const today = todayIst(now);
    const paused = e.pausedAt ? daysBetween(toIstDate(e.pausedAt), today) : 0;
    const settings = await getPlaybookSettings(tx);
    const due = e.waitingForAcceptance
      ? e.nextDueDate
      : fitWeeklyLimit(
          rollOffWeekend(today, pl.skipWeekends),
          touchDates(await touchHistory(tx, personId)),
          settings.weeklyTouchLimit,
          pl.skipWeekends,
        );
    const after = await updateEnrolment(
      tx,
      actor,
      e,
      { status: "Active", pausedAt: null, nextDueDate: due, endsBy: extendBy(e.endsBy, paused) },
      p.fullName,
    );
    await logPlanEvent(tx, actor, p, e.id, `${pl.name} resumed`, now);
    return after;
  });
}

export async function stopPlanTx(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  reason: string,
  now: Date,
) {
  const e = await liveEnrolment(tx, personId);
  if (!e) return null;
  const p = await loadPerson(tx, personId);
  const pl = await loadPlan(tx, e.planId);
  const after = await updateEnrolment(
    tx,
    actor,
    e,
    { status: "Stopped", endedAt: now, endReason: reason, nextDueDate: null },
    p.fullName,
  );
  await logPlanEvent(tx, actor, p, e.id, `${pl.name} stopped: ${reason}`, now);
  return after;
}

export async function stopPlan(
  db: Db,
  actor: Actor,
  personId: string,
  reason: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await loadLive(tx, actor, personId);
    return stopPlanTx(tx, actor, personId, reason.trim() || "Stopped by the rep", now);
  });
}

/** Switch: stop the current plan ("Switched") and enrol in another. */
export async function switchPlan(
  db: Db,
  actor: Actor,
  personId: string,
  planId: string,
  now = new Date(),
) {
  await db.transaction(async (tx) => {
    const { e } = await loadLive(tx, actor, personId);
    if (e.planId === planId) throw new PlanError("They're already on that plan.");
    await stopPlanTx(tx, actor, personId, "Switched", now);
  });
  const r = await enrolPeople(db, actor, [personId], planId, now);
  if (r.skipped.length) throw new PlanError(`Couldn't enrol: ${r.skipped[0].reason}.`);
  return r;
}

/** Withdraw an invite nobody accepted (day 14): the plan stops and Nurture starts. */
export async function withdrawInvite(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { p, e } = await loadLive(tx, actor, personId);
    if (!e.waitingForAcceptance) throw new PlanError("There's no pending connection request.");
    await quickLogTx(
      tx,
      actor,
      personId,
      { action: "requestWithdrawn" },
      { now, activityExtra: { planEnrolmentId: e.id } },
    );
    await stopPlanTx(tx, actor, personId, "Not accepted", now);
    await startNurture(tx, actor, p, now);
  });
}

async function startNurture(tx: DbOrTx, actor: Actor, p: PersonRow, now: Date) {
  const settings = await getPlaybookSettings(tx);
  const until = addDaysIst(todayIst(now), settings.nurtureDays);
  await tx.update(person).set({ nurtureUntil: until }).where(eq(person.id, p.id));
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Person",
    recordId: p.id,
    recordName: p.fullName,
    action: "Updated",
    before: { nurtureUntil: p.nurtureUntil },
    after: { nurtureUntil: until },
  });
}

/** Finished (or out of time) with no reply: Nurture for 60 days, or Lost ("No response"). */
export async function finishPlan(
  db: Db,
  actor: Actor,
  personId: string,
  choice: "nurture" | "lost",
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const { p, e, pl } = await loadLive(tx, actor, personId);
    const steps = await stepsOf(tx, e.planId, e.version);
    const today = todayIst(now);
    const finished = e.currentStep > steps.length || (e.endsBy !== null && e.endsBy < today);
    if (!finished) throw new PlanError("The plan isn't finished yet.");
    const reason = e.currentStep > steps.length ? "Finished, no reply" : "Time limit reached";
    await updateEnrolment(
      tx,
      actor,
      e,
      { status: "Completed", endedAt: now, endReason: reason, nextDueDate: null },
      p.fullName,
    );
    await logPlanEvent(tx, actor, p, e.id, `${pl.name}: ${reason.toLowerCase()}`, now);
    if (choice === "nurture") await startNurture(tx, actor, p, now);
    else
      await quickLogTx(
        tx,
        actor,
        personId,
        { action: "markLost", lostReason: "No response" },
        { now },
      );
  });
}

/** Nurture check (D-033): when Nurture ends, the rep enrols them again or marks them Lost. */
export async function nurtureLost(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const p = await loadPerson(tx, personId);
    assertCan(actor, "lead.edit", p);
    await tx.update(person).set({ nurtureUntil: null }).where(eq(person.id, personId));
    await quickLogTx(
      tx,
      actor,
      personId,
      { action: "markLost", lostReason: "No response" },
      { now },
    );
  });
}

/** Snooze a plan step to tomorrow, still within the guardrails (F08). */
export async function snoozeStep(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const { p, e, pl } = await loadLive(tx, actor, personId);
    if (e.status !== "Active") throw new PlanError("The plan is paused.");
    const settings = await getPlaybookSettings(tx);
    const tomorrow = addDaysIst(todayIst(now), 1);
    const due = fitWeeklyLimit(
      tomorrow,
      touchDates(await touchHistory(tx, personId)),
      settings.weeklyTouchLimit,
      pl.skipWeekends,
    );
    return updateEnrolment(tx, actor, e, { nextDueDate: due }, p.fullName, "snoozed");
  });
}

/** Enrolments in a plan, newest first (for reports and the plan page). */
export async function enrolmentsFor(db: DbOrTx, planId: string) {
  return db
    .select()
    .from(planEnrolment)
    .where(eq(planEnrolment.planId, planId))
    .orderBy(desc(planEnrolment.startedAt));
}
