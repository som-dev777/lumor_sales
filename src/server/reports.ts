// Reports (F19): a snapshot of a person's or the team's work over a period, saved so it never
// changes later. Anyone can report on themselves; Admins on the team or anyone. Each report is
// audited when made and when its AI summary is written.
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { csvFile } from "@/lib/csv";
import type { Db, DbOrTx } from "@/lib/db/client";
import { activity, company, person, reportRun, user } from "@/lib/db/schema";
import { assertCan, can, type Actor } from "@/lib/permissions";
import { spanLabel, type DateSpan } from "@/lib/report-periods";
import { istDateSpan, toIstDate } from "@/lib/time";
import { runPrompt } from "./ai/client";
import { funnelTotals, planPerformance, type Conversion, type Counts } from "./dashboard";
import { LeadError } from "./leads/companies";

export type PersonNumbers = {
  userId: string | null;
  name: string;
  requests: number;
  messages: number;
  emails: number;
  calls: number;
  callsConnected: number;
  replies: number;
  meetingsBooked: number;
  meetingsHeld: number;
  proposals: number;
  trials: number;
  conversions: number;
  dealValueInr: number;
  stepsDone: number;
  stepsOnTime: number;
  stepsLate: number;
  stepsNotRecorded: number;
};

export type ReportData = {
  version: 1;
  title: string;
  scope: "team" | "person";
  personName: string | null;
  from: string;
  to: string;
  generatedAt: string;
  people: PersonNumbers[];
  total: PersonNumbers;
  funnel: { totals: Counts; conversions: Conversion[] };
  plans: Awaited<ReturnType<typeof planPerformance>>;
};

export type ReportTarget = { scope: "team" } | { scope: "person"; userId: string };

const NUMBER_KEYS = [
  "requests",
  "messages",
  "emails",
  "calls",
  "callsConnected",
  "replies",
  "meetingsBooked",
  "meetingsHeld",
  "proposals",
  "trials",
  "conversions",
  "dealValueInr",
  "stepsDone",
  "stepsOnTime",
  "stepsLate",
  "stepsNotRecorded",
] as const satisfies readonly (keyof PersonNumbers)[];

const zero = (userId: string | null, name: string): PersonNumbers => ({
  userId,
  name,
  ...(Object.fromEntries(NUMBER_KEYS.map((k) => [k, 0])) as Omit<PersonNumbers, "userId" | "name">),
});

const STEP_TYPES = ["Request sent", "Message sent", "InMail sent", "Call", "Task done"];

/** Builds the report's numbers from the data as it is now. */
export async function buildReport(
  db: DbOrTx,
  target: ReportTarget,
  span: DateSpan,
  now = new Date(),
): Promise<ReportData> {
  const range = istDateSpan(span.from, span.to);
  // Who is in it: one person, or every active user plus anyone with activity in the period.
  const users = await db
    .select({ id: user.id, name: user.name, active: user.active })
    .from(user)
    .orderBy(user.name);
  const acts = await db
    .select({
      userId: activity.userId,
      type: activity.type,
      channel: activity.channel,
      callOutcome: activity.callOutcome,
      toStage: activity.toStage,
      at: activity.occurredAt,
      stepOrder: activity.planStepOrder,
      dueDate: activity.planDueDate,
    })
    .from(activity)
    .where(
      and(
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
        target.scope === "person" ? eq(activity.userId, target.userId) : undefined,
      ),
    );
  const active = new Set(acts.map((a) => a.userId));
  const included = users.filter((u) =>
    target.scope === "person" ? u.id === target.userId : u.active || active.has(u.id),
  );
  if (target.scope === "person" && included.length === 0) {
    throw new LeadError("That person doesn't exist.");
  }
  const rows = new Map(included.map((u) => [u.id, zero(u.id, u.name)]));

  for (const a of acts) {
    const r = rows.get(a.userId);
    if (!r) continue;
    if (a.type === "Request sent") r.requests += 1;
    else if (a.type === "Message sent" && a.channel === "Email") r.emails += 1;
    else if (a.type === "Message sent" || a.type === "InMail sent") r.messages += 1;
    else if (a.type === "Call") {
      r.calls += 1;
      if (a.callOutcome === "Connected") r.callsConnected += 1;
    } else if (a.type === "Reply received") r.replies += 1;
    else if (a.type === "Meeting booked") r.meetingsBooked += 1;
    else if (a.type === "Meeting held") r.meetingsHeld += 1;
    else if (a.type === "Stage change" && a.toStage === "Proposal sent") r.proposals += 1;
    else if (a.type === "Stage change" && a.toStage === "Trial") r.trials += 1;
    // Plan adherence: steps done, on time or late against the due date kept with them.
    if (a.stepOrder !== null && STEP_TYPES.includes(a.type)) {
      r.stepsDone += 1;
      if (!a.dueDate) r.stepsNotRecorded += 1;
      else if (toIstDate(a.at) <= a.dueDate) r.stepsOnTime += 1;
      else r.stepsLate += 1;
    }
  }

  // Conversions: the owner's people converted in the period, and their companies' deal values.
  const ids = [...rows.keys()];
  const converted = ids.length
    ? await db
        .select({
          ownerId: person.ownerId,
          companyId: person.companyId,
          value: company.dealValueInr,
        })
        .from(person)
        .leftJoin(company, eq(company.id, person.companyId))
        .where(
          and(
            eq(person.converted, true),
            gte(person.convertedDate, span.from),
            lt(person.convertedDate, toIstDate(range.end)),
            inArray(person.ownerId, ids),
          ),
        )
    : [];
  const counted = new Set<string>();
  for (const c of converted) {
    const r = rows.get(c.ownerId)!;
    r.conversions += 1;
    // A company's deal value counts once, even with several people converted there.
    if (c.companyId && !counted.has(c.companyId)) {
      counted.add(c.companyId);
      r.dealValueInr += c.value ?? 0;
    }
  }

  const people = [...rows.values()];
  const total = zero(null, "Total");
  for (const p of people) for (const k of NUMBER_KEYS) total[k] += p[k];
  const personName = target.scope === "person" ? people[0].name : null;
  const repIds = target.scope === "person" ? [target.userId] : null;
  return {
    version: 1,
    title: `${personName ?? "Team"} · ${spanLabel(span)}`,
    scope: target.scope,
    personName,
    from: span.from,
    to: span.to,
    generatedAt: now.toISOString(),
    people,
    total,
    funnel: await funnelTotals(db, range, repIds),
    plans: await planPerformance(db, range, repIds),
  };
}

/** A user may report on themselves; the team or anyone else needs `reports.team`. */
function assertMayReport(actor: Actor, target: ReportTarget) {
  if (target.scope === "person" && target.userId === actor.id) {
    assertCan(actor, "record.view");
    return;
  }
  assertCan(actor, "reports.team");
}

/** Makes and saves a report. `actor` is empty when a schedule makes it. */
export async function createReport(
  db: Db,
  actor: Actor | null,
  target: ReportTarget,
  span: DateSpan,
  { now = new Date(), scheduleId = null }: { now?: Date; scheduleId?: string | null } = {},
) {
  if (actor) assertMayReport(actor, target);
  const data = await buildReport(db, target, span, now);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reportRun)
      .values({
        scope: target.scope,
        personUserId: target.scope === "person" ? target.userId : null,
        fromDate: span.from,
        toDate: span.to,
        title: data.title,
        data,
        generatedBy: actor?.id ?? null,
        createdBy: actor?.id ?? null,
        scheduleId,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor?.id ?? null,
      entityType: "Report",
      recordId: row.id,
      recordName: row.title,
      action: "Created",
      after: {
        scope: row.scope,
        from: row.fromDate,
        to: row.toDate,
        ...(scheduleId ? { source: "schedule" } : {}),
      },
    });
    return row;
  });
}

/** Saved reports a user may open: Admins all; Users the ones they made or that are about them. */
function visibleTo(viewer: Actor) {
  return can(viewer, "reports.team")
    ? undefined
    : or(eq(reportRun.personUserId, viewer.id), eq(reportRun.generatedBy, viewer.id));
}

export async function listReports(db: DbOrTx, viewer: Actor, limit = 100) {
  return db
    .select({
      id: reportRun.id,
      title: reportRun.title,
      scope: reportRun.scope,
      fromDate: reportRun.fromDate,
      toDate: reportRun.toDate,
      createdAt: reportRun.createdAt,
      generatedBy: user.name,
      scheduleId: reportRun.scheduleId,
      emailedTo: reportRun.emailedTo,
    })
    .from(reportRun)
    .leftJoin(user, eq(user.id, reportRun.generatedBy))
    .where(visibleTo(viewer))
    .orderBy(desc(reportRun.createdAt))
    .limit(limit);
}

export async function getReport(db: DbOrTx, viewer: Actor, id: string) {
  const [row] = await db
    .select()
    .from(reportRun)
    .where(and(eq(reportRun.id, id), visibleTo(viewer)));
  return row ? { ...row, data: row.data as ReportData } : null;
}

// --- CSV ------------------------------------------------------------------------------------

const COLUMNS: { key: (typeof NUMBER_KEYS)[number]; label: string }[] = [
  { key: "requests", label: "Connection requests" },
  { key: "messages", label: "Messages" },
  { key: "emails", label: "Emails" },
  { key: "calls", label: "Calls" },
  { key: "callsConnected", label: "Calls connected" },
  { key: "replies", label: "Replies" },
  { key: "meetingsBooked", label: "Meetings booked" },
  { key: "meetingsHeld", label: "Meetings held" },
  { key: "proposals", label: "Proposals sent" },
  { key: "trials", label: "Trials" },
  { key: "conversions", label: "Conversions" },
  { key: "dealValueInr", label: "Deal value (INR)" },
  { key: "stepsDone", label: "Plan steps done" },
  { key: "stepsOnTime", label: "On time" },
  { key: "stepsLate", label: "Late" },
  { key: "stepsNotRecorded", label: "Due date not recorded" },
];
export const REPORT_COLUMNS = COLUMNS;

const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 100)}%`);

/** One CSV with every table, each under its own heading row. */
export function reportCsv(r: ReportData, aiSummary: string | null): string {
  const rows: unknown[][] = [
    [r.title],
    ["Period", r.from, r.to],
    ["Made", r.generatedAt],
    [],
    ["Activity, outcomes and plan adherence"],
    ["Person", ...COLUMNS.map((c) => c.label)],
    ...[...r.people, r.total].map((p) => [p.name, ...COLUMNS.map((c) => p[c.key])]),
    [],
    ["Funnel"],
    ["Conversion", "From", "To", "Rate", "Benchmark"],
    ...r.funnel.conversions.map((c) => [c.label, c.from, c.to, pct(c.rate), pct(c.benchmark)]),
    [],
    ["Plan performance"],
    ["Plan", "Step", "Enrolled / done", "Replied", "Reply rate"],
    ...r.plans.flatMap((p) => [
      [p.name, "All", p.enrolled, p.replied, pct(p.replyRate)],
      ...p.steps.map((s) => [p.name, s.order, s.done, s.replies, pct(s.rate)]),
    ]),
  ];
  if (aiSummary) rows.push([], ["AI summary"], [aiSummary]);
  return csvFile(rows);
}

// --- AI summary (P06) -----------------------------------------------------------------------

export const summarySchema = z.object({ summary: z.string() });

/** The report's numbers, as the AI reads them (nothing else, so it can't invent anything). */
function aiInput(r: ReportData) {
  return {
    REPORT: {
      title: r.title,
      period: `${r.from} to ${r.to}`,
      people: [...r.people, r.total].map((p) => ({
        name: p.name,
        ...Object.fromEntries(COLUMNS.map((c) => [c.label, p[c.key]])),
      })),
      funnel: r.funnel.conversions.map((c) => ({
        step: c.label,
        from: c.from,
        to: c.to,
        rate: pct(c.rate),
        benchmark: pct(c.benchmark),
        status: c.status,
      })),
      plans: r.plans.map((p) => ({
        plan: p.name,
        enrolled: p.enrolled,
        replied: p.replied,
        replyRate: pct(p.replyRate),
      })),
    },
  };
}

/** P06: 2–3 sentences on what stands out. Throws AiError when the AI isn't set up or fails. */
export async function summariseReport(r: ReportData): Promise<string> {
  const result = await runPrompt("P06", summarySchema, aiInput(r), () => ({
    summary: `${r.total.requests} connection requests and ${r.total.replies} replies in this period. ${r.total.meetingsBooked} meetings were booked.`,
  }));
  return result.summary.trim();
}

/** Saves the AI summary on a report the viewer may open. */
export async function writeAiSummary(db: Db, actor: Actor, id: string) {
  const run = await getReport(db, actor, id);
  if (!run) throw new LeadError("That report doesn't exist.");
  assertCan(actor, "record.view");
  const summary = await summariseReport(run.data);
  return saveSummary(db, actor, run.id, run.title, run.aiSummary, summary);
}

export async function saveSummary(
  db: Db,
  actor: Actor | null,
  id: string,
  title: string,
  before: string | null,
  summary: string,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(reportRun)
      .set({ aiSummary: summary })
      .where(eq(reportRun.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor?.id ?? null,
      entityType: "Report",
      recordId: id,
      recordName: title,
      action: "Updated",
      before: { aiSummary: before },
      after: { aiSummary: summary },
    });
    return row;
  });
}

/** Saves who a scheduled report was emailed to. */
export async function saveEmailedTo(db: Db, id: string, title: string, to: string[]) {
  if (to.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.update(reportRun).set({ emailedTo: to }).where(eq(reportRun.id, id));
    await writeAudit(tx, {
      userId: null,
      entityType: "Report",
      recordId: id,
      recordName: title,
      action: "Updated",
      before: { emailedTo: [] },
      after: { emailedTo: to },
    });
  });
}
