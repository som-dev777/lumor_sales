// Today planner (F08): rules build the rep's task list; AI prompt P01 can then order and
// explain it. Done logs the matching quick-log; Snooze hides a lead until tomorrow.
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { accountFilter, activity, company, person, persona } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, formatIstDate, toIstDate, todayIst } from "@/lib/time";
import { runPrompt } from "./ai/client";
import { LeadError } from "./leads/companies";
import { loadPerson } from "./leads/people";
import { getPlaybookSettings, quickLog, type QuickLog } from "./leads/quicklog";

import { SECTIONS, type SectionKey } from "@/lib/today-sections";

export { SECTIONS, type SectionKey };

export type Task = {
  id: string;
  section: SectionKey;
  personId: string;
  name: string;
  title: string | null;
  company: string | null;
  persona: string | null;
  tier: number | null;
  detail: string;
  /** What Done logs, or null when there's no Done (stale leads). */
  doneLabel: string | null;
  reason?: string;
};

const FOLLOW_UP_ACTIONS = [
  "Send Message 1",
  "Send Follow-up 1",
  "Send Follow-up 2",
  "Send Break-up",
];

/** Which quick-log a task's Done runs (F08 table). */
function doneFor(section: SectionKey, nextAction: string | null): QuickLog | null {
  switch (section) {
    case "reply":
      return { action: "responded" };
    case "demo":
      return nextAction === "Send recap" ? { action: "recapSent" } : { action: "demoHeld" };
    case "followUp":
      return nextAction === "Send Message 1"
        ? { action: "message1Sent" }
        : { action: "followUpSent" };
    case "withdraw":
      return { action: "requestWithdrawn" };
    case "stale":
      return null;
  }
}

const DONE_LABELS: Record<QuickLog["action"], string> = {
  responded: "Mark replied",
  recapSent: "Recap sent",
  demoHeld: "Demo held",
  message1Sent: "Message 1 sent",
  followUpSent: "Sent",
  requestWithdrawn: "Withdrawn",
  requestSent: "Done",
  accepted: "Done",
  gotReply: "Done",
  demoBooked: "Done",
  markConverted: "Done",
  markLost: "Done",
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

/** The rule-based list for one rep's own leads (F08 sections, in order). */
export async function buildToday(db: DbOrTx, viewer: Actor, now = new Date()): Promise<TodayPlan> {
  const today = todayIst(now);
  const settings = await getPlaybookSettings(db);
  const leads = await db
    .select({ p: person, companyName: company.name, personaName: persona.name, tier: persona.tier })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(
      and(
        eq(person.ownerId, viewer.id),
        notInArray(person.stage, ["Lost", "Paid"]),
        or(isNull(person.snoozedUntil), lte(person.snoozedUntil, today)),
      ),
    );

  const ids = leads.map((l) => l.p.id);
  const events = ids.length
    ? await db
        .select({ personId: activity.personId, type: activity.type, at: activity.occurredAt })
        .from(activity)
        .where(inArray(activity.personId, ids))
        .orderBy(desc(activity.occurredAt))
    : [];
  const latest = new Map<string, { type: string; at: Date }>();
  const lastRequest = new Map<string, Date>();
  for (const e of events) {
    if (!e.personId) continue;
    if (!latest.has(e.personId)) latest.set(e.personId, e);
    if (e.type === "Request sent" && !lastRequest.has(e.personId))
      lastRequest.set(e.personId, e.at);
  }

  const withdrawBefore = addDaysIst(today, -settings.withdrawAfterDays);
  const staleBefore = addDaysIst(today, -settings.staleLeadDays);
  const due = (d: string | null) => d !== null && d <= today;
  const when = (d: string | null) => (d ? ` · due ${formatIstDate(d)}` : "");

  const tasks: Task[] = [];
  for (const { p, companyName, personaName, tier } of leads) {
    const last = latest.get(p.id);
    let section: SectionKey | null = null;
    let detail = "";
    if (last?.type === "Reply received") {
      section = "reply";
      detail = `Replied ${formatIstDate(toIstDate(last.at))}`;
    } else if (
      (p.nextAction === "Hold demo" && due(p.nextActionDate)) ||
      (p.stage === "Demo done" && p.nextAction === "Send recap" && due(p.nextActionDate))
    ) {
      section = "demo";
      detail = `${p.nextAction}${when(p.nextActionDate)}`;
    } else if (FOLLOW_UP_ACTIONS.includes(p.nextAction ?? "") && due(p.nextActionDate)) {
      section = "followUp";
      detail = `${p.nextAction}${when(p.nextActionDate)}`;
    } else if (p.stage === "Request sent" && lastRequest.has(p.id)) {
      const sent = toIstDate(lastRequest.get(p.id)!);
      if (sent < withdrawBefore) {
        section = "withdraw";
        detail = `Request sent ${formatIstDate(sent)}, not accepted`;
      }
    }
    if (!section) {
      const lastDay = toIstDate(last?.at ?? p.createdAt);
      if (lastDay < staleBefore) {
        section = "stale";
        detail = last ? `No activity since ${formatIstDate(lastDay)}` : "Nothing logged yet";
      }
    }
    if (!section) continue;
    const done = doneFor(section, p.nextAction);
    tasks.push({
      id: `${section}:${p.id}`,
      section,
      personId: p.id,
      name: p.fullName,
      title: p.title,
      company: companyName,
      persona: personaName,
      tier,
      detail,
      doneLabel: done ? DONE_LABELS[done.action] : null,
    });
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
      messagesSent: count("Message sent"),
      repliesReceived: count("Reply received"),
      demosBooked: count("Demo booked"),
      demosHeld: count("Demo held"),
      dailyConnectionTarget: settings.dailyConnectionTarget,
      dailyMessageTarget: settings.dailyMessageTarget,
    },
  };
}

// --- Done and Snooze -------------------------------------------------------------------------

/** Done on a task: runs the matching quick-log (F08 table). */
export async function completeTask(db: Db, actor: Actor, taskId: string, now = new Date()) {
  const [section, personId] = taskId.split(":") as [SectionKey, string];
  if (!SECTIONS.some((s) => s.key === section) || !personId) throw new LeadError("Unknown task.");
  const p = await loadPerson(db, personId);
  const done = doneFor(section, p.nextAction);
  if (!done) throw new LeadError("Open the lead to work on it.");
  return quickLog(db, actor, personId, done, { now });
}

/** Snooze to tomorrow: hidden from Today until then. Audited. */
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
