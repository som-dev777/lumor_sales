// Reports (F19): a snapshot of a person's or the team's work over a period, saved so it never
// changes later. Anyone can report on themselves; Admins on the team or anyone. Each report is
// audited when made and when its AI summary is written.
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
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

/** The consolidated view per rep (D-043): what they added, who they reached, and the outcome. */
export type PipelineRow = {
  userId: string | null;
  name: string;
  peopleAdded: number;
  companiesAdded: number;
  /** People contacted for the first time in the period. */
  newOutreach: number;
  /** People who replied in the period. */
  replied: number;
  converted: number;
  /** Contacted for the first time in the period, no reply so far. */
  noResponse: number;
  /** Where their people stand now, by stage. */
  stages: Record<string, number>;
};

export type ReportData = {
  /** 2 from v2.7.0 (adds the Pipeline section); older saved reports are 1. */
  version: 1 | 2;
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
  pipeline?: { people: PipelineRow[]; total: PipelineRow };
};

export const PIPELINE_COLUMNS: {
  key: Exclude<keyof PipelineRow, "userId" | "name" | "stages">;
  label: string;
}[] = [
  { key: "peopleAdded", label: "People added" },
  { key: "companiesAdded", label: "Companies added" },
  { key: "newOutreach", label: "New outreach" },
  { key: "replied", label: "Replied" },
  { key: "converted", label: "Converted" },
  { key: "noResponse", label: "No response yet" },
];

const OUTREACH_TYPES = ["Request sent", "Message sent", "InMail sent", "Call"] as const;

/** The Pipeline section (D-043) for the people in a report. */
async function buildPipeline(
  db: DbOrTx,
  people: PersonNumbers[],
  range: { start: Date; end: Date },
): Promise<{ people: PipelineRow[]; total: PipelineRow }> {
  const ids = people.map((p) => p.userId!).filter(Boolean);
  const rows = new Map<string, PipelineRow>(
    people.map((p) => [
      p.userId!,
      {
        userId: p.userId,
        name: p.name,
        peopleAdded: 0,
        companiesAdded: 0,
        newOutreach: 0,
        replied: 0,
        converted: p.conversions,
        noResponse: 0,
        stages: {},
      },
    ]),
  );
  if (ids.length > 0) {
    const inRange = (col: typeof person.createdAt) =>
      and(gte(col, range.start), lt(col, range.end));
    for (const r of await db
      .select({ by: person.createdBy })
      .from(person)
      .where(and(inRange(person.createdAt), inArray(person.createdBy, ids)))) {
      if (r.by) rows.get(r.by)!.peopleAdded += 1;
    }
    for (const r of await db
      .select({ by: company.createdBy })
      .from(company)
      .where(
        and(
          gte(company.createdAt, range.start),
          lt(company.createdAt, range.end),
          inArray(company.createdBy, ids),
        ),
      )) {
      if (r.by) rows.get(r.by)!.companiesAdded += 1;
    }
    // First outreach touch per person (ever), and replies after it.
    const touches = await db
      .select({ personId: activity.personId, userId: activity.userId, at: activity.occurredAt })
      .from(activity)
      .where(and(inArray(activity.type, [...OUTREACH_TYPES]), lt(activity.occurredAt, range.end)))
      .orderBy(activity.occurredAt);
    const first = new Map<string, { userId: string; at: Date }>();
    for (const t of touches) {
      if (t.personId && !first.has(t.personId)) first.set(t.personId, t);
    }
    const replies = await db
      .select({ personId: activity.personId, userId: activity.userId, at: activity.occurredAt })
      .from(activity)
      .where(eq(activity.type, "Reply received"));
    const repliedInRange = new Map<string, Set<string>>();
    for (const r of replies) {
      if (!r.personId || r.at < range.start || r.at >= range.end) continue;
      const set = repliedInRange.get(r.userId) ?? new Set<string>();
      set.add(r.personId);
      repliedInRange.set(r.userId, set);
    }
    for (const [userId, set] of repliedInRange) {
      const row = rows.get(userId);
      if (row) row.replied = set.size;
    }
    for (const [personId, t] of first) {
      if (t.at < range.start || t.at >= range.end) continue;
      const row = rows.get(t.userId);
      if (!row) continue;
      row.newOutreach += 1;
      if (!replies.some((r) => r.personId === personId && r.at >= t.at)) row.noResponse += 1;
    }
    // Where their people stand now.
    for (const r of await db
      .select({ ownerId: person.ownerId, stage: person.stage })
      .from(person)
      .where(inArray(person.ownerId, ids))) {
      const row = rows.get(r.ownerId);
      if (row) row.stages[r.stage] = (row.stages[r.stage] ?? 0) + 1;
    }
  }
  const list = [...rows.values()];
  const total: PipelineRow = {
    userId: null,
    name: "Total",
    peopleAdded: 0,
    companiesAdded: 0,
    newOutreach: 0,
    replied: 0,
    converted: 0,
    noResponse: 0,
    stages: {},
  };
  for (const r of list) {
    for (const c of PIPELINE_COLUMNS) total[c.key] += r[c.key];
    for (const [k, n] of Object.entries(r.stages)) total.stages[k] = (total.stages[k] ?? 0) + n;
  }
  return { people: list, total };
}

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
    version: 2,
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
    pipeline: await buildPipeline(db, people, range),
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

/**
 * Saved reports a user may open: Admins all; Users the ones they made, the ones about them,
 * and the ones sent to them (D-043).
 */
function visibleTo(viewer: Actor) {
  return can(viewer, "reports.team")
    ? undefined
    : or(
        eq(reportRun.personUserId, viewer.id),
        eq(reportRun.generatedBy, viewer.id),
        sharedWithUser(viewer.id),
      );
}

const sharedWithUser = (userId: string) =>
  sql`exists (select 1 from json_each(${reportRun.sharedWith}) where value = ${userId})`;

export const REPORT_TABS = ["mine", "shared", "all"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

/** Report history (D-043): made by me, shared with me (or about me), or all (Admins). */
export async function listReports(db: DbOrTx, viewer: Actor, tab: ReportTab = "mine", limit = 100) {
  const where =
    tab === "mine"
      ? eq(reportRun.generatedBy, viewer.id)
      : tab === "shared"
        ? and(
            or(sharedWithUser(viewer.id), eq(reportRun.personUserId, viewer.id)),
            or(isNull(reportRun.generatedBy), ne(reportRun.generatedBy, viewer.id)),
          )
        : visibleTo(viewer);
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
    .where(where)
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
