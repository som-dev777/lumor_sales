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
import { followUps, newOutreach } from "./outreach";
import { buildEvents, type ReportEvents } from "./report-events";
import {
  eventsTitle,
  headlines,
  NUMBER_KEYS,
  NUMBER_SECTIONS,
  PIPELINE_COLUMNS,
  REPORT_COLUMNS,
} from "@/lib/report-columns";

export { eventsTitle, headlines, NUMBER_SECTIONS, PIPELINE_COLUMNS, REPORT_COLUMNS };
const COLUMNS = REPORT_COLUMNS;
import {
  applyEdits,
  cleanEdits,
  hiddenOf,
  SECTION_KEYS,
  type ReportEdits,
  type ReportSection,
} from "@/lib/report-shape";

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
  /** People added, sent a request or contacted for the first time in the period (D-057). */
  newOutreach: number;
  /** People contacted before and contacted again in the period (D-058; missing before 2.12). */
  followUps?: number;
  /** People who replied in the period. */
  replied: number;
  converted: number;
  /** Contacted for the first time in the period, no reply so far. */
  noResponse: number;
  /** Where their people stand now, by stage. */
  stages: Record<string, number>;
};

/** One thing done with a person, for the What happened section (D-057). */
export type DetailAction = {
  at: string;
  rep: string;
  personId: string | null;
  person: string | null;
  company: string | null;
  what: string;
  channel: string | null;
  text: string | null;
};

/** What happened in the period, by name (a daily sales report, D-057). */
export type ReportDetails = {
  companies: { at: string; name: string; by: string | null; companyId: string }[];
  people: {
    at: string;
    name: string;
    title: string | null;
    company: string | null;
    by: string | null;
    personId: string;
  }[];
  actions: DetailAction[];
  /** Rows left out after the first DETAIL_LIMIT of each list. */
  more: { companies: number; people: number; actions: number };
};

export type ReportData = {
  /**
   * 2 from v2.7.0 (adds Pipeline); 3 from v2.11.0 (adds What happened); 4 from v2.12.0 (Events
   * of the day replaces What happened). Older saved reports keep what they had.
   */
  version: 1 | 2 | 3 | 4;
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
  /** What happened (v2.11.0 reports only). */
  details?: ReportDetails;
  /** Events of the day (from v2.12.0, D-058). */
  events?: ReportEvents;
};

/** Stages that mean converted (a manual move in the edit form counts too, D-057). */
const CONVERTED_STAGES = ["Paid", "Active customer"] as const;

/**
 * People converted in the period (D-057): marked converted with a date in it, or moved to Paid or
 * Active customer in it. Each person once, with their owner and company's deal value.
 */
async function convertedPeople(
  db: DbOrTx,
  range: { start: Date; end: Date },
  span: DateSpan,
  ownerIds: string[],
) {
  if (ownerIds.length === 0) return [];
  const moved = await db
    .select({ personId: activity.personId })
    .from(activity)
    .where(
      and(
        eq(activity.type, "Stage change"),
        inArray(activity.toStage, [...CONVERTED_STAGES]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
      ),
    );
  const movedIds = [...new Set(moved.map((m) => m.personId))];
  return db
    .select({
      personId: person.id,
      ownerId: person.ownerId,
      companyId: person.companyId,
      value: company.dealValueInr,
    })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .where(
      and(
        inArray(person.ownerId, ownerIds),
        or(
          and(
            eq(person.converted, true),
            gte(person.convertedDate, span.from),
            lt(person.convertedDate, toIstDate(range.end)),
          ),
          movedIds.length ? inArray(person.id, movedIds) : sql`0`,
        ),
      ),
    );
}

/** The Pipeline section (D-043; numbers aligned with Today and People in D-057). */
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
        followUps: 0,
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
    // New outreach: the same rule as Today (D-057). No response yet: of those, nobody replied.
    const repliedEver = new Set(
      (
        await db
          .select({ personId: activity.personId })
          .from(activity)
          .where(eq(activity.type, "Reply received"))
      ).map((r) => r.personId),
    );
    const fresh = await newOutreach(db, range, ids);
    for (const [userId, set] of fresh) {
      const row = rows.get(userId);
      if (!row) continue;
      row.newOutreach = set.size;
      row.noResponse = [...set].filter((id) => !repliedEver.has(id)).length;
    }
    for (const [userId, set] of await followUps(db, range, fresh, ids)) {
      const row = rows.get(userId);
      if (row) row.followUps = set.size;
    }
    // Replied: each person who replied in the period (or was moved to Replied), by their owner.
    const repliedIds = new Set(
      (
        await db
          .select({ personId: activity.personId })
          .from(activity)
          .where(
            and(
              or(
                eq(activity.type, "Reply received"),
                and(eq(activity.type, "Stage change"), eq(activity.toStage, "Replied")),
              ),
              gte(activity.occurredAt, range.start),
              lt(activity.occurredAt, range.end),
            ),
          )
      ).map((r) => r.personId),
    );
    // Where their people stand now, and who replied, by owner.
    for (const r of await db
      .select({ id: person.id, ownerId: person.ownerId, stage: person.stage })
      .from(person)
      .where(inArray(person.ownerId, ids))) {
      const row = rows.get(r.ownerId);
      if (!row) continue;
      row.stages[r.stage] = (row.stages[r.stage] ?? 0) + 1;
      if (repliedIds.has(r.id)) row.replied += 1;
    }
  }
  const list = [...rows.values()];
  const total: PipelineRow = {
    userId: null,
    name: "Total",
    peopleAdded: 0,
    companiesAdded: 0,
    newOutreach: 0,
    followUps: 0,
    replied: 0,
    converted: 0,
    noResponse: 0,
    stages: {},
  };
  for (const r of list) {
    for (const c of PIPELINE_COLUMNS) total[c.key] = (total[c.key] ?? 0) + (r[c.key] ?? 0);
    total.noResponse += r.noResponse;
    for (const [k, n] of Object.entries(r.stages)) total.stages[k] = (total.stages[k] ?? 0) + n;
  }
  return { people: list, total };
}

export type ReportTarget = { scope: "team" } | { scope: "person"; userId: string };

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

  // Conversions: the owner's people converted in the period (D-057), and their deal values.
  const ids = [...rows.keys()];
  const converted = await convertedPeople(db, range, span, ids);
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
    version: 4,
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
    events: await buildEvents(
      db,
      range,
      target.scope === "person" ? target.userId : null,
      toIstDate(now),
    ),
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
  return row
    ? {
        ...row,
        data: row.data as ReportData,
        edits: (row.edits ?? {}) as Record<string, number>,
        hiddenSections: row.hiddenSections ?? [],
      }
    : null;
}

// --- CSV ------------------------------------------------------------------------------------

const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 100)}%`);

/** One CSV with every included table, each under its own heading row (D-057, D-058). */
export function reportCsv(
  r: ReportData,
  aiSummary: string | null,
  hidden: readonly ReportSection[] = [],
): string {
  const on = (k: ReportSection) => !hidden.includes(k);
  const label = (key: string) => COLUMNS.find((c) => c.key === key)!.label;
  const rows: unknown[][] = [[r.title], ["Period", r.from, r.to], ["Made", r.generatedAt]];
  if (aiSummary && on("summary")) rows.push([], ["AI summary"], [aiSummary]);
  if (r.pipeline && on("pipeline")) {
    const h = headlines(r);
    rows.push(
      [],
      ["Pipeline"],
      h.map((x) => x.label),
      h.map((x) => x.value ?? ""),
      [],
      ["Person", ...PIPELINE_COLUMNS.map((c) => c.label)],
      ...[...r.pipeline.people, r.pipeline.total].map((p) => [
        p.name,
        ...PIPELINE_COLUMNS.map((c) => p[c.key] ?? ""),
      ]),
    );
  }
  for (const sec of NUMBER_SECTIONS) {
    if (!on(sec.key)) continue;
    rows.push(
      [],
      [sec.title],
      ["Person", ...sec.keys.map(label)],
      ...[...r.people, r.total].map((p) => [p.name, ...sec.keys.map((k) => p[k])]),
    );
  }
  if (r.events && on("details")) {
    const e = r.events;
    rows.push(
      [],
      [eventsTitle(r)],
      ["Companies added", "People added", "Contacts", "Replies", "Meetings and demos"],
      [e.counts.companies, e.counts.people, e.counts.contacts, e.counts.replies, e.counts.meetings],
      [],
      [
        "Company",
        "New company",
        "Person",
        "Title",
        "New person",
        "Facts",
        "What we offered",
        "What they said",
        "Outlook",
        "Next step",
      ],
    );
    for (const c of e.companies) {
      if (c.people.length === 0)
        rows.push([c.name, c.isNew ? "New" : "", "", "", "", "", "", "", "", ""]);
      for (const p of c.people) {
        rows.push([
          c.name,
          c.isNew ? "New" : "",
          p.name,
          p.title ?? "",
          p.isNew ? "New" : "",
          p.facts.join(" · "),
          p.summary?.offered ?? "",
          p.summary?.theySaid ?? "",
          p.summary?.outlook ?? "",
          p.summary?.nextStep ?? "",
        ]);
      }
    }
  } else if (r.details && on("details")) {
    const d = r.details;
    rows.push(
      [],
      ["What happened: contacts, replies and meetings"],
      ["When", "Rep", "Person", "Company", "What", "Channel", "Message"],
      ...d.actions.map((a) => [
        a.at,
        a.rep,
        a.person ?? "",
        a.company ?? "",
        a.what,
        a.channel ?? "",
        a.text ?? "",
      ]),
    );
  }
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

// --- Shaping a report (D-057) ---------------------------------------------------------------

type ShapeRun = { id: string; title: string; generatedBy: string | null; data: ReportData };

/** The report's maker or an Admin may choose its sections and edit its numbers. */
export function mayShape(actor: Actor, run: Pick<ShapeRun, "generatedBy">) {
  return run.generatedBy === actor.id || can(actor, "reports.team");
}

async function loadForShape(db: DbOrTx, actor: Actor, id: string) {
  const run = await getReport(db, actor, id);
  if (!run) throw new LeadError("That report doesn't exist.");
  if (!mayShape(actor, run)) {
    throw new LeadError("Only the person who made this report, or an Admin, can change it.");
  }
  return run;
}

/** The report as shown and downloaded: edits laid over, and the sections left out. */
export function shapeOf(run: {
  data: unknown;
  edits?: Record<string, number> | null;
  hiddenSections?: string[] | null;
}) {
  return {
    data: applyEdits(run.data as ReportData, run.edits ?? {}),
    hidden: hiddenOf(run.hiddenSections),
  };
}

/**
 * The sections a download leaves out (D-059): the ones switched off on screen when the link was
 * made (`?hide=…`), else the saved choice.
 */
export function hiddenFor(request: Request, saved: ReportSection[]): ReportSection[] {
  const param = new URL(request.url).searchParams.get("hide");
  return param === null ? saved : hiddenOf(param.split(","));
}

/** Includes or leaves out one section in the downloads. Audited. */
export async function setSectionIncluded(
  db: Db,
  actor: Actor,
  id: string,
  section: string,
  included: boolean,
) {
  if (!(SECTION_KEYS as string[]).includes(section)) throw new LeadError("Unknown section.");
  return db.transaction(async (tx) => {
    const run = await loadForShape(tx, actor, id);
    const before = hiddenOf(run.hiddenSections);
    const after = included
      ? before.filter((s) => s !== section)
      : [...new Set([...before, section as ReportSection])];
    await tx.update(reportRun).set({ hiddenSections: after }).where(eq(reportRun.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report",
      recordId: id,
      recordName: run.title,
      action: "Updated",
      before: { hiddenSections: before },
      after: { hiddenSections: after },
    });
    return after;
  });
}

/** Saves the edited numbers on this report only (the app's data never changes). Audited. */
export async function saveReportEdits(
  db: Db,
  actor: Actor,
  id: string,
  edits: Record<string, unknown>,
) {
  return db.transaction(async (tx) => {
    const run = await loadForShape(tx, actor, id);
    let clean: ReportEdits;
    try {
      clean = cleanEdits(run.data, edits);
    } catch (e) {
      throw new LeadError(e instanceof Error ? e.message : "Those numbers can't be saved.");
    }
    // Only numbers that differ from the original are kept.
    const original = run.data;
    const base = applyEdits(original, {});
    const kept: ReportEdits = {};
    for (const [k, v] of Object.entries(clean)) {
      if (valueAt(base, k) !== v) kept[k] = v;
    }
    const before = run.edits ?? {};
    await tx.update(reportRun).set({ edits: kept }).where(eq(reportRun.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Report",
      recordId: id,
      recordName: run.title,
      action: "Updated",
      before: { edits: before },
      after: { edits: kept },
    });
    return kept;
  });
}

/** The original value of an editable number. */
export function valueAt(data: ReportData, key: string): number | undefined {
  const [part, a, b] = key.split(".");
  const row = <T extends { userId: string | null }>(rows: T[], total: T) =>
    a === "total" ? total : rows.find((r) => r.userId === a);
  if (part === "pipeline" && data.pipeline) {
    const r = row(data.pipeline.people, data.pipeline.total);
    return r ? (r[b as keyof PipelineRow] as number) : undefined;
  }
  if (part === "numbers") {
    const r = row(data.people, data.total);
    return r ? (r[b as keyof PersonNumbers] as number) : undefined;
  }
  if (part === "funnel") {
    const c = data.funnel.conversions[Number(a)];
    return c ? (b === "from" ? c.from : c.to) : undefined;
  }
  if (part === "plans") {
    const p = data.plans.find((x) => x.planId === a);
    return p ? (b === "enrolled" ? p.enrolled : p.replied) : undefined;
  }
  return undefined;
}
