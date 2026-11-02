// Today planner (F08 v2): driven by plans and deadlines. Rules build the rep's list; AI prompt
// P01 can then order and explain it. Step tasks carry the exact message or call script.
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  accountFilter,
  activity,
  company,
  person,
  persona,
  plan,
  planEnrolment,
  planStep,
  user,
} from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, formatIst, formatIstDate, istDayRange, toIstDate, todayIst } from "@/lib/time";
import { ORIGIN_LABEL, SECTIONS, type SectionKey } from "@/lib/today-sections";
import { aiKnowledge } from "./ai/assist";
import { runPrompt } from "./ai/client";
import { LeadError } from "./leads/companies";
import { loadPerson } from "./leads/people";
import { getPlaybookSettings, quickLog, type QuickLog } from "./leads/quicklog";
import { meetingsToday } from "./calendar";
import { planState } from "./plans/enrolment";

export { SECTIONS, type SectionKey };

/** What a task's main button does. */
export type TaskKind =
  | "step" // do the plan step (message, call, task, connection request)
  | "withdraw" // withdraw an unaccepted invite
  | "finished" // Nurture or Lost
  | "nurture" // Nurture ended: enrol again or Lost
  | "quick" // a quick-log (Mark replied, Meeting held, Recap sent)
  | "nudge" // a reply-by date passed (F18): draft a nudge, or close the loop
  | "open"; // nothing to log here: open the lead

export type Task = {
  id: string;
  section: SectionKey;
  kind: TaskKind;
  personId: string;
  name: string;
  title: string | null;
  company: string | null;
  persona: string | null;
  tier: number | null;
  detail: string;
  /** Label of the quick-log for "quick" tasks. */
  doneLabel: string | null;
  // Plan step details (kind "step").
  planName?: string;
  channel?: string | null;
  message?: string | null;
  script?: string | null;
  email?: string | null;
  reason?: string;
  /** Replies waiting: the IST date they replied (for the Team tab). */
  since?: string;
  /** When it was due (IST date); a backlog task was due before today (D-043). */
  dueDate?: string;
  daysLate?: number;
  /** For a backlog task: the section it came from. */
  origin?: SectionKey;
};

const QUICK_DONE: Record<string, { log: QuickLog; label: string }> = {
  reply: { log: { action: "responded" }, label: "Mark replied" },
  meeting: { log: { action: "meetingHeld" }, label: "Meeting held" },
  recap: { log: { action: "recapSent" }, label: "Recap sent" },
};

export type TodayPlan = {
  today: string;
  tasks: Task[];
  outreach: {
    sent: number;
    target: number;
    left: number;
    persona: string | null;
    accountFilter: string | null;
  };
  week: Record<string, number>;
};

const CLOSED = ["Lost", "Paid", "Active customer"] as const;

/** What the rules need to know about a lead's plan (from planState, or in bulk). */
export type PlanFacts = {
  status: "Active" | "Paused" | "Completed" | "Stopped";
  finished: boolean;
  /** No step left (vs. the time limit passing). */
  allDone: boolean;
  stepCount: number;
  currentStep: number;
  waitingForAcceptance: boolean;
  /** For a withdraw: the date the invite should be withdrawn. */
  nextDueDate: string | null;
  requestSentDate: string | null;
  planType: string;
  planName: string;
  channel: string | null;
};

export type LeadFacts = {
  snoozedUntil: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  awaitingReplyUntil: string | null;
  nudgeCount: number;
  nurtureUntil: string | null;
  stage: string;
  createdAt: Date;
};

export type Classified = {
  section: SectionKey;
  kind: TaskKind;
  detail: string;
  doneLabel?: string;
  since?: string;
  due: string | null;
  /** Plan step (kind "step"). */
  step?: boolean;
};

const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/**
 * The Today rules for one lead (F08 v2; Backlog and dated snooze, D-043). A lead appears once,
 * in the first section that matches. Anything due before today goes to Backlog; a snoozed task
 * is due on its snooze date. Shared by Today, the Team tab and the backlog badges.
 */
export function classifyLead(
  p: LeadFacts,
  last: { type: string; at: Date } | undefined,
  plan: PlanFacts | null,
  today: string,
  staleBefore: string,
): Classified | null {
  const snoozed = p.snoozedUntil !== null && p.snoozedUntil > today;
  const due = (d: string | null) => d !== null && d <= today;
  // A task snoozed to a date is due that day (not late).
  const withSnooze = (d: string | null) => later(d, p.snoozedUntil);

  // 1. Replies waiting.
  if (last?.type === "Reply received" && !snoozed) {
    const since = toIstDate(last.at);
    return {
      section: "reply",
      kind: "quick",
      detail: `Replied ${formatIstDate(since)}`,
      doneLabel: QUICK_DONE.reply.label,
      since,
      due: withSnooze(since),
    };
  }
  // 2. Meetings today (and recaps after them).
  if (
    !snoozed &&
    due(p.nextActionDate) &&
    (p.nextAction === "Hold meeting" || p.nextAction === "Send recap")
  ) {
    const recap = p.nextAction === "Send recap";
    return {
      section: "meeting",
      kind: "quick",
      detail: `${p.nextAction} · ${formatIstDate(p.nextActionDate!)}`,
      doneLabel: recap ? QUICK_DONE.recap.label : QUICK_DONE.meeting.label,
      due: withSnooze(p.nextActionDate),
    };
  }
  // 3. Expired reply deadlines (F18): nudge, at most twice, then close the loop.
  if (!snoozed && p.awaitingReplyUntil && p.awaitingReplyUntil < today) {
    const by = formatIstDate(p.awaitingReplyUntil);
    return {
      section: "deadline",
      kind: "nudge",
      detail:
        p.nudgeCount >= 2
          ? `No reply after 2 nudges (expected by ${by}). Close the loop politely.`
          : `Expected a reply by ${by} · nudge ${p.nudgeCount + 1} of 2`,
      due: withSnooze(addDaysIst(p.awaitingReplyUntil, 1)),
    };
  }
  // 4–7. Plans.
  if (plan) {
    if (plan.finished && plan.status === "Active") {
      return {
        section: "finished",
        kind: "finished",
        detail: plan.allDone
          ? `All ${plan.stepCount} steps done`
          : "The plan's time limit has passed",
        due: null,
      };
    }
    if (plan.status !== "Active") return null; // paused: they're in a conversation
    if (plan.waitingForAcceptance) {
      if (plan.nextDueDate !== null && plan.nextDueDate <= today) {
        return {
          section: "due",
          kind: "withdraw",
          detail: `No acceptance since ${formatIstDate(plan.requestSentDate ?? today)}. Withdraw the invite.`,
          due: plan.nextDueDate,
        };
      }
      return null;
    }
    if (plan.nextDueDate && plan.nextDueDate <= today) {
      return {
        section: plan.planType === "Trial" ? "trial" : "due",
        kind: "step",
        detail: `Step ${plan.currentStep} of ${plan.stepCount}: ${plan.channel}`,
        due: plan.nextDueDate,
        step: true,
      };
    }
    return null;
  }
  // 8. Nurture checks.
  if (p.nurtureUntil) {
    if (p.nurtureUntil <= today && !snoozed) {
      return {
        section: "nurture",
        kind: "nurture",
        detail: `Nurture ended ${formatIstDate(p.nurtureUntil)}`,
        due: null,
      };
    }
    return null;
  }
  // 9. Stale leads not on any plan.
  if (!snoozed && !(CLOSED as readonly string[]).includes(p.stage)) {
    const lastDay = toIstDate(last?.at ?? p.createdAt);
    if (lastDay < staleBefore) {
      return {
        section: "stale",
        kind: "open",
        detail: last ? `No activity since ${formatIstDate(lastDay)}` : "Nothing logged yet",
        due: null,
      };
    }
  }
  return null;
}

/** Days between two IST dates. */
const daysLate = (due: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);

/** The latest real activity per lead: system events (plan and stage changes) don't count. */
async function latestActivity(db: DbOrTx, ids: string[]) {
  const latest = new Map<string, { type: string; at: Date }>();
  for (let i = 0; i < ids.length; i += 400) {
    const events = await db
      .select({ personId: activity.personId, type: activity.type, at: activity.occurredAt })
      .from(activity)
      .where(
        and(
          inArray(activity.personId, ids.slice(i, i + 400)),
          notInArray(activity.type, ["Plan change", "Stage change"]),
        ),
      )
      .orderBy(desc(activity.occurredAt));
    for (const e of events) {
      if (e.personId && !latest.has(e.personId)) latest.set(e.personId, e);
    }
  }
  return latest;
}

/** The rep's list for today (F08 v2), one task per lead, in section order. */
export async function buildToday(db: DbOrTx, viewer: Actor, now = new Date()): Promise<TodayPlan> {
  const today = todayIst(now);
  const settings = await getPlaybookSettings(db);
  const leads = await db
    .select({ p: person, companyName: company.name, personaName: persona.name, tier: persona.tier })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(
      and(eq(person.ownerId, viewer.id), ne(person.stage, "Lost"), eq(person.doNotContact, false)),
    );

  const latest = await latestActivity(
    db,
    leads.map((l) => l.p.id),
  );
  const staleBefore = addDaysIst(today, -settings.staleLeadDays);

  const tasks: Task[] = [];
  for (const { p, companyName, personaName, tier } of leads) {
    const state = await planState(db, p.id, today);
    const facts: PlanFacts | null = state
      ? {
          status: state.enrolment.status,
          finished: state.finished,
          allDone: !state.step,
          stepCount: state.steps.length,
          currentStep: state.enrolment.currentStep,
          waitingForAcceptance: state.enrolment.waitingForAcceptance,
          nextDueDate: state.enrolment.nextDueDate,
          requestSentDate: state.enrolment.requestSentDate,
          planType: state.plan.planType,
          planName: state.plan.name,
          channel: state.channel,
        }
      : null;
    const c = classifyLead(p, latest.get(p.id), facts, today, staleBefore);
    if (!c) continue;
    const late = c.due !== null && c.due < today;
    const section: SectionKey = late ? "backlog" : c.section;
    const lateBy = late ? daysLate(c.due!, today) : 0;
    tasks.push({
      id: `${c.section}:${p.id}`,
      section,
      kind: c.kind,
      personId: p.id,
      name: p.fullName,
      title: p.title,
      company: companyName,
      persona: personaName,
      tier,
      doneLabel: c.doneLabel ?? null,
      detail: late
        ? `${ORIGIN_LABEL[c.section] ?? "Task"}: ${c.detail} · due ${formatIstDate(c.due!)} · ${lateBy} day${lateBy === 1 ? "" : "s"} late`
        : c.detail,
      ...(c.since ? { since: c.since } : {}),
      ...(c.due ? { dueDate: c.due } : {}),
      ...(late ? { daysLate: lateBy, origin: c.section } : {}),
      ...(facts && (c.kind === "step" || c.kind === "withdraw" || c.kind === "finished")
        ? { planName: facts.planName }
        : {}),
      ...(c.step && state
        ? {
            channel: state.channel,
            message: state.message,
            script: state.step?.script ?? null,
            email: p.email,
          }
        : {}),
    });
  }

  const order = SECTIONS.map((s) => s.key);
  tasks.sort(
    (a, b) =>
      order.indexOf(a.section) - order.indexOf(b.section) ||
      (b.daysLate ?? 0) - (a.daysLate ?? 0) ||
      (a.tier ?? 9) - (b.tier ?? 9) ||
      a.name.localeCompare(b.name),
  );

  // New outreach target: requests left today, with a Tier 1 persona and a filter to work on.
  const startOfDay = new Date(`${today}T00:00:00+05:30`);
  const mine = await db
    .select({ type: activity.type, at: activity.occurredAt })
    .from(activity)
    .where(
      and(
        eq(activity.userId, viewer.id),
        gte(activity.occurredAt, new Date(startOfDay.getTime() - 6 * 86_400_000)),
        lte(activity.occurredAt, new Date(startOfDay.getTime() + 86_400_000)),
      ),
    );
  // New outreach today (owner, 2026-10-30): each person the rep added today or sent a connection
  // request to today, counted once.
  const reached = new Set(
    (
      await db
        .select({ personId: activity.personId })
        .from(activity)
        .where(
          and(
            eq(activity.userId, viewer.id),
            eq(activity.type, "Request sent"),
            gte(activity.occurredAt, startOfDay),
            lt(activity.occurredAt, new Date(startOfDay.getTime() + 86_400_000)),
          ),
        )
    ).map((a) => a.personId),
  );
  const added = await db
    .select({ id: person.id })
    .from(person)
    .where(
      and(
        eq(person.createdBy, viewer.id),
        gte(person.createdAt, startOfDay),
        lt(person.createdAt, new Date(startOfDay.getTime() + 86_400_000)),
      ),
    );
  for (const p of added) reached.add(p.id);
  const sent = reached.size;
  const [suggestedPersona] = await db
    .select({ name: persona.name })
    .from(persona)
    .where(and(eq(persona.type, "Official"), eq(persona.status, "Active"), eq(persona.tier, 1)))
    .orderBy(asc(persona.name))
    .limit(1);
  const [suggestedFilter] = await db
    .select({ code: accountFilter.code, name: accountFilter.name })
    .from(accountFilter)
    .where(and(eq(accountFilter.type, "Official"), eq(accountFilter.status, "Active")))
    .orderBy(asc(accountFilter.code))
    .limit(1);

  const count = (type: string) => mine.filter((a) => a.type === type).length;
  return {
    today,
    tasks,
    outreach: {
      sent,
      target: settings.dailyConnectionTarget,
      left: Math.max(0, settings.dailyConnectionTarget - sent),
      persona: suggestedPersona?.name ?? null,
      accountFilter: suggestedFilter ? `${suggestedFilter.code} ${suggestedFilter.name}` : null,
    },
    week: {
      requestsSent: count("Request sent"),
      requestsAccepted: count("Request accepted"),
      messagesSent: count("Message sent") + count("InMail sent"),
      callsMade: count("Call"),
      repliesReceived: count("Reply received"),
      meetingsBooked: count("Meeting booked"),
      meetingsHeld: count("Meeting held"),
      dailyConnectionTarget: settings.dailyConnectionTarget,
      dailyMessageTarget: settings.dailyMessageTarget,
    },
  };
}

// --- Team tab (F08, R8: Admins) ---------------------------------------------------------------

/** What counts as "done today" on the Team tab (D-038). */
const DONE_TYPES = [
  "Request sent",
  "Message sent",
  "InMail sent",
  "Call",
  "Task done",
  "Request withdrawn",
  "Meeting held",
] as const;

export type TeamRow = {
  userId: string;
  name: string;
  role: string;
  /** Today's work: every section except Backlog and Stale. */
  dueToday: number;
  /** Work from earlier days (D-043). */
  backlog: number;
  /** Calendar meetings today, hosting or as a teammate. */
  meetingsToday: number;
  doneToday: number;
  inPlans: number;
  repliesWaiting: number;
};

export const TEAM_DETAILS = ["due", "backlog", "meetings", "done", "plans", "replies"] as const;
export type TeamDetail = (typeof TEAM_DETAILS)[number];

/** A reply waiting since before yesterday (in Replies waiting or, once late, in Backlog). */
const oldReply = (t: Task, dayBefore: string) =>
  (t.section === "reply" || t.origin === "reply") && t.since !== undefined && t.since < dayBefore;

/**
 * Per active user: the same rules as their My day (D-043), so the numbers always match it.
 */
export async function buildTeam(db: DbOrTx, viewer: Actor, now = new Date()): Promise<TeamRow[]> {
  assertCan(viewer, "today.team");
  const today = todayIst(now);
  const { start, end } = istDayRange(today);
  const users = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.active, true))
    .orderBy(asc(user.name));
  const rows: TeamRow[] = [];
  for (const u of users) {
    const plan = await buildToday(db, { id: u.id, role: u.role, active: true }, now);
    const [{ n: inPlans }] = await db
      .select({ n: count() })
      .from(planEnrolment)
      .innerJoin(person, eq(person.id, planEnrolment.personId))
      .where(and(eq(person.ownerId, u.id), eq(planEnrolment.status, "Active")));
    const [{ n: doneToday }] = await db
      .select({ n: count() })
      .from(activity)
      .where(
        and(
          eq(activity.userId, u.id),
          inArray(activity.type, [...DONE_TYPES]),
          gte(activity.occurredAt, start),
          lt(activity.occurredAt, end),
        ),
      );
    const meetings = await meetingsToday(db, u.id, now);
    const dayBefore = addDaysIst(today, -1);
    rows.push({
      userId: u.id,
      name: u.name,
      role: u.role,
      dueToday: plan.tasks.filter((t) => t.section !== "backlog" && t.section !== "stale").length,
      backlog: plan.tasks.filter((t) => t.section === "backlog").length,
      meetingsToday: meetings.length,
      doneToday,
      inPlans,
      repliesWaiting: plan.tasks.filter((t) => oldReply(t, dayBefore)).length,
    });
  }
  return rows;
}

export type TeamDetailRow = {
  personId: string | null;
  name: string;
  what: string;
  when: string | null;
};

/** The list behind one number on the Team tab (D-043). */
export async function teamDetail(
  db: DbOrTx,
  viewer: Actor,
  userId: string,
  show: TeamDetail,
  now = new Date(),
): Promise<{ name: string; rows: TeamDetailRow[] }> {
  assertCan(viewer, "today.team");
  const [u] = await db
    .select({ id: user.id, name: user.name, role: user.role, active: user.active })
    .from(user)
    .where(eq(user.id, userId));
  if (!u) throw new LeadError("That person doesn't exist.");
  const today = todayIst(now);
  const { start, end } = istDayRange(today);
  const label = (k: SectionKey) => SECTIONS.find((x) => x.key === k)!.label;
  if (show === "due" || show === "backlog" || show === "replies") {
    const plan = await buildToday(db, { id: u.id, role: u.role, active: true }, now);
    const dayBefore = addDaysIst(today, -1);
    const tasks = plan.tasks.filter((t) =>
      show === "due"
        ? t.section !== "backlog" && t.section !== "stale"
        : show === "backlog"
          ? t.section === "backlog"
          : oldReply(t, dayBefore),
    );
    return {
      name: u.name,
      rows: tasks.map((t) => ({
        personId: t.personId,
        name: t.name,
        what: `${label(t.origin ?? t.section)}: ${t.detail}`,
        when: t.dueDate ? formatIstDate(t.dueDate) : null,
      })),
    };
  }
  if (show === "meetings") {
    const meetings = await meetingsToday(db, u.id, now);
    return {
      name: u.name,
      rows: meetings.map((m) => ({
        personId: m.personId,
        name: m.inviteeName,
        what: `${m.meetingTypeName}${m.hosting ? "" : ` (with ${m.hostName})`}`,
        when: formatIst(m.startsAt, "h:mm aaa"),
      })),
    };
  }
  if (show === "done") {
    const done = await db
      .select({
        personId: activity.personId,
        name: person.fullName,
        type: activity.type,
        at: activity.occurredAt,
      })
      .from(activity)
      .leftJoin(person, eq(person.id, activity.personId))
      .where(
        and(
          eq(activity.userId, u.id),
          inArray(activity.type, [...DONE_TYPES]),
          gte(activity.occurredAt, start),
          lt(activity.occurredAt, end),
        ),
      )
      .orderBy(desc(activity.occurredAt));
    return {
      name: u.name,
      rows: done.map((d) => ({
        personId: d.personId,
        name: d.name ?? "—",
        what: d.type,
        when: formatIst(d.at, "h:mm aaa"),
      })),
    };
  }
  const onPlans = await db
    .select({
      personId: person.id,
      name: person.fullName,
      planName: plan.name,
      step: planEnrolment.currentStep,
      due: planEnrolment.nextDueDate,
    })
    .from(planEnrolment)
    .innerJoin(person, eq(person.id, planEnrolment.personId))
    .innerJoin(plan, eq(plan.id, planEnrolment.planId))
    .where(and(eq(person.ownerId, u.id), eq(planEnrolment.status, "Active")))
    .orderBy(asc(planEnrolment.nextDueDate));
  return {
    name: u.name,
    rows: onPlans.map((r) => ({
      personId: r.personId,
      name: r.name,
      what: `${r.planName} · step ${r.step}`,
      when: r.due ? `next ${formatIstDate(r.due)}` : null,
    })),
  };
}

// --- Quick tasks and Snooze (non-plan tasks) ------------------------------------------------

/** Done on a reply or meeting task: runs the matching quick-log. */
export async function completeTask(db: Db, actor: Actor, taskId: string, now = new Date()) {
  const [section, personId] = taskId.split(":") as [SectionKey, string];
  if (!SECTIONS.some((s) => s.key === section) || !personId) throw new LeadError("Unknown task.");
  const p = await loadPerson(db, personId);
  const done =
    section === "reply"
      ? QUICK_DONE.reply.log
      : section === "meeting"
        ? p.nextAction === "Send recap"
          ? QUICK_DONE.recap.log
          : QUICK_DONE.meeting.log
        : null;
  if (!done) throw new LeadError("Open the lead to work on it.");
  return quickLog(db, actor, personId, done, { now });
}

/** The latest date a task can be snoozed to: 60 days ahead (D-043). */
export const MAX_SNOOZE_DAYS = 60;

/** Checks a snooze date: after today and at most 60 days ahead; empty = tomorrow. */
export function snoozeDate(until: string | null | undefined, now = new Date()): string {
  const today = todayIst(now);
  const date = until || addDaysIst(today, 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= today) {
    throw new LeadError("Pick a date after today.");
  }
  if (date > addDaysIst(today, MAX_SNOOZE_DAYS)) {
    throw new LeadError(`Pick a date within ${MAX_SNOOZE_DAYS} days.`);
  }
  return date;
}

/** Snooze a non-plan task to a date (tomorrow by default): hidden until then, due that day. */
export async function snoozeLead(
  db: Db,
  actor: Actor,
  personId: string,
  now = new Date(),
  until?: string | null,
) {
  const date = snoozeDate(until, now);
  return db.transaction(async (tx) => {
    const before = await loadPerson(tx, personId);
    assertCan(actor, "lead.edit", before);
    const [after] = await tx
      .update(person)
      .set({ snoozedUntil: date })
      .where(eq(person.id, personId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: personId,
      recordName: after.fullName,
      action: "Updated",
      before: { snoozedUntil: before.snoozedUntil },
      after: { snoozedUntil: after.snoozedUntil },
    });
    return after;
  });
}

// --- AI ranking (P01) ------------------------------------------------------------------------

export const rankingSchema = z.object({
  order: z.array(z.object({ id: z.string(), reason: z.string() })),
  summary: z.string(),
});

/** Puts tasks in the AI's order with its reasons; tasks it left out go last, unranked. */
export function applyRanking(tasks: Task[], ranking: z.infer<typeof rankingSchema>): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ranked: Task[] = [];
  for (const r of ranking.order) {
    const t = byId.get(r.id);
    if (!t) continue; // ignore ids the AI made up
    ranked.push({ ...t, reason: r.reason.trim().slice(0, 160) });
    byId.delete(r.id);
  }
  return [...ranked, ...byId.values()];
}

export async function rankToday(db: Db, viewer: Actor, now = new Date()) {
  const plan = await buildToday(db, viewer, now);
  if (plan.tasks.length === 0) return { tasks: [], summary: null as string | null };
  const knowledge = await aiKnowledge(db, "P01", viewer.id);
  const ranking = await runPrompt(
    "P01",
    rankingSchema,
    {
      "KNOWLEDGE BASE": knowledge.KNOWLEDGE_BASE,
      TODAY: plan.today,
      TASKS: plan.tasks.map((t) => ({
        id: t.id,
        section: SECTIONS.find((s) => s.key === t.section)!.label,
        lead: t.name,
        title: t.title,
        company: t.company,
        persona: t.persona,
        personaTier: t.tier,
        plan: t.planName ?? null,
        detail: t.detail,
      })),
      ACTIVITY: plan.week,
      TARGETS: {
        dailyConnectionRequests: plan.outreach.target,
        sentToday: plan.outreach.sent,
        dailyNewMessages: plan.week.dailyMessageTarget,
      },
    },
    () => ({
      // Stand-in AI for the browser tests: Tier 1 first, then the rest.
      order: [...plan.tasks]
        .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9))
        .map((t) => ({ id: t.id, reason: `Ranked: ${t.detail}` })),
      summary: `You sent ${plan.week.requestsSent} requests this week. Keep going to hit ${plan.outreach.target} a day.`,
    }),
  );
  return { tasks: applyRanking(plan.tasks, ranking), summary: ranking.summary.trim() };
}

// --- Backlog badges on People and Companies (D-043) ------------------------------------------

export type BacklogInfo = {
  dueDate: string;
  daysLate: number;
  origin: SectionKey;
  companyId: string | null;
};

/** People with a backlog, per company (for the Companies list). */
export function backlogByCompany(backlog: Map<string, BacklogInfo>) {
  const out = new Map<string, number>();
  for (const b of backlog.values()) {
    if (b.companyId) out.set(b.companyId, (out.get(b.companyId) ?? 0) + 1);
  }
  return out;
}

/**
 * Every lead with a backlog task (any owner), using the same rules as Today, read in bulk so
 * the People and Companies lists stay fast.
 */
export async function backlogByPerson(
  db: DbOrTx,
  now = new Date(),
): Promise<Map<string, BacklogInfo>> {
  const today = todayIst(now);
  const settings = await getPlaybookSettings(db);
  const staleBefore = addDaysIst(today, -settings.staleLeadDays);
  const leads = await db
    .select()
    .from(person)
    .where(and(ne(person.stage, "Lost"), eq(person.doNotContact, false)));
  const live = await db
    .select({
      e: planEnrolment,
      planName: plan.name,
      planType: plan.planType,
    })
    .from(planEnrolment)
    .innerJoin(plan, eq(plan.id, planEnrolment.planId))
    .where(inArray(planEnrolment.status, ["Active", "Paused"]));
  const counts = await db
    .select({ planId: planStep.planId, version: planStep.version, n: count() })
    .from(planStep)
    .groupBy(planStep.planId, planStep.version);
  const stepsOf = (planId: string, version: number) =>
    counts.find((c) => c.planId === planId && c.version === version)?.n ?? 0;
  const byPerson = new Map(live.map((l) => [l.e.personId, l]));
  const latest = await latestActivity(
    db,
    leads.map((p) => p.id),
  );
  const out = new Map<string, BacklogInfo>();
  for (const p of leads) {
    const l = byPerson.get(p.id);
    const stepCount = l ? stepsOf(l.e.planId, l.e.version) : 0;
    const facts: PlanFacts | null = l
      ? {
          status: l.e.status,
          allDone: l.e.currentStep > stepCount,
          finished: l.e.currentStep > stepCount || (l.e.endsBy !== null && l.e.endsBy < today),
          stepCount,
          currentStep: l.e.currentStep,
          waitingForAcceptance: l.e.waitingForAcceptance,
          nextDueDate: l.e.nextDueDate,
          requestSentDate: l.e.requestSentDate,
          planType: l.planType,
          planName: l.planName,
          channel: null,
        }
      : null;
    const c = classifyLead(p, latest.get(p.id), facts, today, staleBefore);
    if (c?.due && c.due < today) {
      out.set(p.id, {
        dueDate: c.due,
        daysLate: daysLate(c.due, today),
        origin: c.section,
        companyId: p.companyId,
      });
    }
  }
  return out;
}

/** One person's backlog task, if any (for their page). */
export async function backlogOf(db: DbOrTx, personId: string, now = new Date()) {
  const today = todayIst(now);
  const [p] = await db.select().from(person).where(eq(person.id, personId));
  if (!p || p.stage === "Lost" || p.doNotContact) return null;
  const settings = await getPlaybookSettings(db);
  const state = await planState(db, personId, today);
  const facts: PlanFacts | null = state
    ? {
        status: state.enrolment.status,
        finished: state.finished,
        allDone: !state.step,
        stepCount: state.steps.length,
        currentStep: state.enrolment.currentStep,
        waitingForAcceptance: state.enrolment.waitingForAcceptance,
        nextDueDate: state.enrolment.nextDueDate,
        requestSentDate: state.enrolment.requestSentDate,
        planType: state.plan.planType,
        planName: state.plan.name,
        channel: state.channel,
      }
    : null;
  const latest = await latestActivity(db, [personId]);
  const c = classifyLead(
    p,
    latest.get(personId),
    facts,
    today,
    addDaysIst(today, -settings.staleLeadDays),
  );
  if (!c?.due || c.due >= today) return null;
  return {
    what: `${ORIGIN_LABEL[c.section] ?? "Task"}: ${c.detail}`,
    dueDate: c.due,
    daysLate: daysLate(c.due, today),
  };
}
