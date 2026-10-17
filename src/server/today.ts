// Today planner (F08 v2): driven by plans and deadlines. Rules build the rep's list; AI prompt
// P01 can then order and explain it. Step tasks carry the exact message or call script.
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, activity, company, person, persona } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, formatIstDate, toIstDate, todayIst } from "@/lib/time";
import { SECTIONS, type SectionKey } from "@/lib/today-sections";
import { runPrompt } from "./ai/client";
import { LeadError } from "./leads/companies";
import { loadPerson } from "./leads/people";
import { getPlaybookSettings, quickLog, type QuickLog } from "./leads/quicklog";
import { planState } from "./plans/enrolment";

export { SECTIONS, type SectionKey };

/** What a task's main button does. */
export type TaskKind =
  | "step" // do the plan step (message, call, task, connection request)
  | "withdraw" // withdraw an unaccepted invite
  | "finished" // Nurture or Lost
  | "nurture" // Nurture ended: enrol again or Lost
  | "quick" // a quick-log (Mark replied, Meeting held, Recap sent)
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

  const ids = leads.map((l) => l.p.id);
  const events = ids.length
    ? await db
        .select({ personId: activity.personId, type: activity.type, at: activity.occurredAt })
        .from(activity)
        .where(inArray(activity.personId, ids))
        .orderBy(desc(activity.occurredAt))
    : [];
  // The latest real activity per lead. System events (plan and stage changes) are skipped:
  // a reply also logs "plan paused" at the same moment, and the reply is what matters.
  const latest = new Map<string, { type: string; at: Date }>();
  for (const e of events) {
    if (e.type === "Plan change" || e.type === "Stage change") continue;
    if (e.personId && !latest.has(e.personId)) latest.set(e.personId, e);
  }
  const staleBefore = addDaysIst(today, -settings.staleLeadDays);
  const due = (d: string | null) => d !== null && d <= today;

  const tasks: Task[] = [];
  for (const { p, companyName, personaName, tier } of leads) {
    const base = {
      personId: p.id,
      name: p.fullName,
      title: p.title,
      company: companyName,
      persona: personaName,
      tier,
      doneLabel: null,
    };
    const snoozed = p.snoozedUntil !== null && p.snoozedUntil > today;
    const last = latest.get(p.id);
    const push = (section: SectionKey, kind: TaskKind, detail: string, extra: Partial<Task> = {}) =>
      tasks.push({ ...base, id: `${section}:${p.id}`, section, kind, detail, ...extra });

    // 1. Replies waiting.
    if (last?.type === "Reply received" && !snoozed) {
      push("reply", "quick", `Replied ${formatIstDate(toIstDate(last.at))}`, {
        doneLabel: QUICK_DONE.reply.label,
      });
      continue;
    }
    // 2. Meetings today (and recaps after them).
    if (
      !snoozed &&
      due(p.nextActionDate) &&
      (p.nextAction === "Hold meeting" || p.nextAction === "Send recap")
    ) {
      const recap = p.nextAction === "Send recap";
      push("meeting", "quick", `${p.nextAction} · ${formatIstDate(p.nextActionDate!)}`, {
        doneLabel: recap ? QUICK_DONE.recap.label : QUICK_DONE.meeting.label,
      });
      continue;
    }
    // 3. Expired reply deadlines (dates are set from R8, F18).
    if (!snoozed && p.awaitingReplyUntil && p.awaitingReplyUntil < today) {
      push("deadline", "open", `Expected a reply by ${formatIstDate(p.awaitingReplyUntil)}`);
      continue;
    }
    // 4–7. Plans.
    const state = await planState(db, p.id, today);
    if (state) {
      const e = state.enrolment;
      if (state.finished && e.status === "Active") {
        push(
          "finished",
          "finished",
          state.step ? "The plan's time limit has passed" : `All ${state.steps.length} steps done`,
          { planName: state.plan.name },
        );
        continue;
      }
      if (e.status !== "Active") continue; // paused: they're in a conversation
      if (state.withdrawDue) {
        push(
          "due",
          "withdraw",
          `No acceptance since ${formatIstDate(e.requestSentDate ?? today)}. Withdraw the invite.`,
          { planName: state.plan.name },
        );
        continue;
      }
      if (!e.waitingForAcceptance && e.nextDueDate && e.nextDueDate <= today) {
        const late = e.nextDueDate < today;
        const section: SectionKey =
          state.plan.planType === "Trial" ? "trial" : late ? "overdue" : "due";
        push(
          section,
          "step",
          `Step ${e.currentStep} of ${state.steps.length}: ${state.channel}${late ? ` · due ${formatIstDate(e.nextDueDate)}` : ""}`,
          {
            planName: state.plan.name,
            channel: state.channel,
            message: state.message,
            script: state.step?.script ?? null,
            email: p.email,
          },
        );
      }
      continue;
    }
    // 8. Nurture checks.
    if (p.nurtureUntil) {
      if (p.nurtureUntil <= today && !snoozed) {
        push("nurture", "nurture", `Nurture ended ${formatIstDate(p.nurtureUntil)}`);
      }
      continue;
    }
    // 9. Stale leads not on any plan.
    if (!snoozed && !(CLOSED as readonly string[]).includes(p.stage)) {
      const lastDay = toIstDate(last?.at ?? p.createdAt);
      if (lastDay < staleBefore) {
        push(
          "stale",
          "open",
          last ? `No activity since ${formatIstDate(lastDay)}` : "Nothing logged yet",
        );
      }
    }
  }

  const order = SECTIONS.map((s) => s.key);
  tasks.sort(
    (a, b) =>
      order.indexOf(a.section) - order.indexOf(b.section) ||
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
  const sent = mine.filter((a) => a.type === "Request sent" && a.at >= startOfDay).length;
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

/** Snooze a non-plan task to tomorrow: the lead is hidden from those sections until then. */
export async function snoozeLead(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const before = await loadPerson(tx, personId);
    assertCan(actor, "lead.edit", before);
    const tomorrow = addDaysIst(todayIst(now), 1);
    const [after] = await tx
      .update(person)
      .set({ snoozedUntil: tomorrow })
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
  const ranking = await runPrompt(
    "P01",
    rankingSchema,
    {
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
