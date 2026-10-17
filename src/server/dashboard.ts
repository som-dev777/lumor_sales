// Dashboard funnel (F11, v2 stages): stages counted from activities dated inside the period
// (PRD, D-020), conversions against benchmarks, breakdowns, and plan reply rates (F17).
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import {
  accountFilter,
  activity,
  person,
  persona,
  plan,
  planEnrolment,
  template,
  user,
} from "@/lib/db/schema";
import {
  addDaysIst,
  isIstDate,
  istMonthRange,
  istWeekRange,
  toIstDate,
  todayIst,
  type Range,
} from "@/lib/time";

export const FUNNEL_STAGES = [
  { key: "contacted", label: "Contacted" },
  { key: "connected", label: "Connected" },
  { key: "replied", label: "Replied" },
  { key: "interested", label: "Interested" },
  { key: "meetingScheduled", label: "Meeting scheduled" },
  { key: "meetingDone", label: "Meeting done" },
  { key: "proposal", label: "Proposal sent" },
  { key: "trial", label: "Trial" },
  { key: "paid", label: "Paid" },
  { key: "active", label: "Active customer" },
] as const;
export type StageKey = (typeof FUNNEL_STAGES)[number]["key"];
export type Counts = Record<StageKey, number>;

/** PRD benchmarks, carried over to the v2 stages (Proposal sent and Active customer get theirs later). */
export const CONVERSIONS = [
  { from: "contacted", to: "connected", label: "Contacted → Connected", benchmark: 0.3 },
  { from: "connected", to: "replied", label: "Connected → Replied", benchmark: 0.1 },
  {
    from: "interested",
    to: "meetingScheduled",
    label: "Interested → Meeting scheduled",
    benchmark: 0.5,
  },
  {
    from: "meetingScheduled",
    to: "meetingDone",
    label: "Meeting scheduled → Meeting done",
    benchmark: 0.7,
  },
  { from: "meetingDone", to: "trial", label: "Meeting done → Trial", benchmark: 0.3 },
] as const satisfies readonly { from: StageKey; to: StageKey; label: string; benchmark: number }[];

/** Fewer than this many in the earlier stage = "low sample" (PRD). */
export const MIN_SAMPLE = 10;

export type Conversion = {
  label: string;
  from: number;
  to: number;
  rate: number | null;
  benchmark: number;
  status: "ok" | "below" | "low";
};

export function conversions(c: Counts): Conversion[] {
  return CONVERSIONS.map((x) => {
    const from = c[x.from];
    const to = c[x.to];
    const rate = from > 0 ? to / from : null;
    const status = from < MIN_SAMPLE ? "low" : rate !== null && rate < x.benchmark ? "below" : "ok";
    return { label: x.label, from, to, rate, benchmark: x.benchmark, status };
  });
}

// --- Periods ------------------------------------------------------------------------------

export type PeriodKind = "week" | "month";
export type Period = Range & {
  kind: PeriodKind;
  anchor: string;
  label: string;
  prev: string;
  next: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** The week (Mon–Sun) or month containing `anchor` (an IST date), with neighbours for arrows. */
export function periodFor(kind: PeriodKind, anchor: string = todayIst()): Period {
  const at = new Date(`${isIstDate(anchor) ? anchor : todayIst()}T06:30:00Z`); // noon IST that day
  const range = kind === "week" ? istWeekRange(at) : istMonthRange(at);
  const first = toIstDate(range.start);
  const last = addDaysIst(toIstDate(range.end), -1);
  const label =
    kind === "week"
      ? `${short(first)} – ${short(last)} ${last.slice(0, 4)}`
      : `${MONTHS[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}`;
  return {
    ...range,
    kind,
    anchor: first,
    label,
    prev: addDaysIst(first, -1),
    next: toIstDate(range.end),
  };
}

// --- Counting -----------------------------------------------------------------------------

export type Dimension = "persona" | "level" | "accountFilter" | "template" | "market" | "rep";
export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "persona", label: "Persona" },
  { key: "level", label: "Level" },
  { key: "accountFilter", label: "Account filter" },
  { key: "template", label: "Template version" },
  { key: "market", label: "Market" },
  { key: "rep", label: "Rep" },
];

const empty = (): Counts => ({
  contacted: 0,
  connected: 0,
  replied: 0,
  interested: 0,
  meetingScheduled: 0,
  meetingDone: 0,
  proposal: 0,
  trial: 0,
  paid: 0,
  active: 0,
});

type Event = {
  stage: StageKey;
  personaId: string | null;
  level: string | null;
  accountFilterId: string | null;
  templateKey: string | null;
  market: string | null;
  repId: string | null;
};

const NOT_SET = "Not set";

/** Every funnel event in the period, with the lead's details for breakdowns. */
async function funnelEvents(db: DbOrTx, period: Range): Promise<Event[]> {
  const leadCols = {
    personaId: person.personaId,
    level: person.level,
    accountFilterId: person.accountFilterId,
    openerTemplateId: person.openerTemplateId,
    openerTemplateVersion: person.openerTemplateVersion,
    market: person.market,
  };
  const inPeriod = and(gte(activity.occurredAt, period.start), lt(activity.occurredAt, period.end));
  const rows = await db
    .select({
      type: activity.type,
      replyType: activity.replyType,
      content: activity.content,
      toStage: activity.toStage,
      callOutcome: activity.callOutcome,
      personId: activity.personId,
      occurredAt: activity.occurredAt,
      repId: activity.userId,
      ...leadCols,
    })
    .from(activity)
    .innerJoin(person, eq(person.id, activity.personId))
    .where(
      and(
        inPeriod,
        inArray(activity.type, [
          "Request sent",
          "Message sent",
          "InMail sent",
          "Call",
          "Request accepted",
          "Reply received",
          "Meeting booked",
          "Meeting held",
          "Stage change",
        ]),
      ),
    );

  // "Replied" = each person's first-ever reply, if it falls in the period.
  const firstReplies = await db
    .select({ personId: activity.personId, first: sql<number>`min(${activity.occurredAt})` })
    .from(activity)
    .where(eq(activity.type, "Reply received"))
    .groupBy(activity.personId);
  const firstAt = new Map(firstReplies.map((r) => [r.personId, Number(r.first)]));

  // "Contacted" = each person's first outreach touch of any kind, if it falls in the period
  // (D-033 F15). Calls count when they connected.
  const firstTouches = await db
    .select({ personId: activity.personId, first: sql<number>`min(${activity.occurredAt})` })
    .from(activity)
    .where(
      sql`${activity.type} IN ('Request sent', 'Message sent', 'InMail sent') OR (${activity.type} = 'Call' AND ${activity.callOutcome} = 'Connected')`,
    )
    .groupBy(activity.personId);
  const firstTouchAt = new Map(firstTouches.map((r) => [r.personId, Number(r.first)]));

  const firstDay = toIstDate(period.start);
  const afterLast = toIstDate(period.end);
  const paid = await db
    .select({ personId: person.id, repId: person.ownerId, ...leadCols })
    .from(person)
    .where(
      and(
        eq(person.converted, true),
        gte(person.convertedDate, firstDay),
        lt(person.convertedDate, afterLast),
      ),
    );

  const base = (r: {
    personaId: string | null;
    level: string | null;
    accountFilterId: string | null;
    openerTemplateId: string | null;
    openerTemplateVersion: string | null;
    market: string | null;
    repId: string | null;
  }) => ({
    personaId: r.personaId,
    level: r.level,
    accountFilterId: r.accountFilterId,
    templateKey: r.openerTemplateId
      ? `${r.openerTemplateId}|${r.openerTemplateVersion ?? ""}`
      : null,
    market: r.market,
    repId: r.repId,
  });

  const events: Event[] = [];
  for (const r of rows) {
    const b = base(r);
    const isTouch =
      r.type === "Request sent" ||
      r.type === "Message sent" ||
      r.type === "InMail sent" ||
      (r.type === "Call" && r.callOutcome === "Connected");
    if (isTouch) {
      if (firstTouchAt.get(r.personId) === r.occurredAt.getTime())
        events.push({ stage: "contacted", ...b });
    } else if (r.type === "Request accepted") events.push({ stage: "connected", ...b });
    else if (r.type === "Meeting booked") events.push({ stage: "meetingScheduled", ...b });
    else if (r.type === "Meeting held") events.push({ stage: "meetingDone", ...b });
    else if (r.type === "Stage change" && r.toStage === "Trial")
      events.push({ stage: "trial", ...b });
    else if (r.type === "Stage change" && r.toStage === "Proposal sent")
      events.push({ stage: "proposal", ...b });
    else if (r.type === "Stage change" && r.toStage === "Active customer")
      events.push({ stage: "active", ...b });
    else if (r.type === "Reply received") {
      if (r.replyType === "Interested") events.push({ stage: "interested", ...b });
      if (firstAt.get(r.personId) === r.occurredAt.getTime())
        events.push({ stage: "replied", ...b });
    }
  }
  for (const p of paid) events.push({ stage: "paid", ...base(p) });
  return events;
}

function keyFor(e: Event, d: Dimension): string | null {
  switch (d) {
    case "persona":
      return e.personaId;
    case "level":
      return e.level;
    case "accountFilter":
      return e.accountFilterId;
    case "template":
      return e.templateKey;
    case "market":
      return e.market;
    case "rep":
      return e.repId;
  }
}

async function labelsFor(db: DbOrTx, d: Dimension, keys: string[]): Promise<Map<string, string>> {
  const ids = keys.filter(Boolean);
  if (ids.length === 0 || d === "level" || d === "market") return new Map(ids.map((k) => [k, k]));
  if (d === "persona") {
    const rows = await db
      .select({ id: persona.id, name: persona.name })
      .from(persona)
      .where(inArray(persona.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
  if (d === "accountFilter") {
    const rows = await db
      .select({ id: accountFilter.id, code: accountFilter.code, name: accountFilter.name })
      .from(accountFilter)
      .where(inArray(accountFilter.id, ids));
    return new Map(rows.map((r) => [r.id, `${r.code} ${r.name}`]));
  }
  if (d === "rep") {
    const rows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
  const templateIds = [...new Set(ids.map((k) => k.split("|")[0]))];
  const rows = await db
    .select({ id: template.id, name: template.name })
    .from(template)
    .where(inArray(template.id, templateIds));
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return new Map(
    ids.map((k) => {
      const [id, version] = k.split("|");
      return [k, `${names.get(id) ?? "Deleted template"}${version ? ` (${version})` : ""}`];
    }),
  );
}

export type DashboardData = {
  period: Period;
  totals: Counts;
  conversions: Conversion[];
  breakdown: { key: string; label: string; counts: Counts; conversions: Conversion[] }[];
  plans: PlanPerformance[];
};

export async function dashboard(
  db: DbOrTx,
  period: Period,
  dimension: Dimension,
): Promise<DashboardData> {
  const events = await funnelEvents(db, period);
  const totals = empty();
  const groups = new Map<string, Counts>();
  for (const e of events) {
    totals[e.stage] += 1;
    const key = keyFor(e, dimension) ?? NOT_SET;
    if (!groups.has(key)) groups.set(key, empty());
    groups.get(key)![e.stage] += 1;
  }
  const labels = await labelsFor(
    db,
    dimension,
    [...groups.keys()].filter((k) => k !== NOT_SET),
  );
  const breakdown = [...groups.entries()]
    .map(([key, counts]) => ({
      key,
      label: key === NOT_SET ? NOT_SET : (labels.get(key) ?? key),
      counts,
      conversions: conversions(counts),
    }))
    .sort((a, b) =>
      a.key === NOT_SET
        ? 1
        : b.key === NOT_SET
          ? -1
          : b.counts.contacted - a.counts.contacted || a.label.localeCompare(b.label),
    );
  return {
    period,
    totals,
    conversions: conversions(totals),
    breakdown,
    plans: await planPerformance(db, period),
  };
}

export type PlanPerformance = {
  planId: string;
  name: string;
  enrolled: number;
  replied: number;
  converted: number;
  replyRate: number | null;
  steps: { order: number; done: number; replies: number; rate: number | null }[];
};

/**
 * Plan reply rates (F17, D-033 F13): people enrolled in the period and how many replied or
 * converted; per step, the touches done in the period and the replies that followed them.
 */
export async function planPerformance(db: DbOrTx, period: Range): Promise<PlanPerformance[]> {
  const enrolments = await db
    .select({
      id: planEnrolment.id,
      planId: planEnrolment.planId,
      personId: planEnrolment.personId,
      startedAt: planEnrolment.startedAt,
      name: plan.name,
      converted: person.converted,
      convertedDate: person.convertedDate,
    })
    .from(planEnrolment)
    .innerJoin(plan, eq(plan.id, planEnrolment.planId))
    .innerJoin(person, eq(person.id, planEnrolment.personId))
    .where(
      and(gte(planEnrolment.startedAt, period.start), lt(planEnrolment.startedAt, period.end)),
    );
  const linked = await db
    .select({
      enrolmentId: activity.planEnrolmentId,
      order: activity.planStepOrder,
      type: activity.type,
      outcome: activity.callOutcome,
      at: activity.occurredAt,
      planId: planEnrolment.planId,
    })
    .from(activity)
    .innerJoin(planEnrolment, eq(planEnrolment.id, activity.planEnrolmentId))
    .where(sql`${activity.planEnrolmentId} IS NOT NULL`);
  const repliedIds = new Set(
    linked.filter((a) => a.type === "Reply received").map((a) => a.enrolmentId),
  );
  const inPeriod = (d: Date) => d >= period.start && d < period.end;
  const touch = (t: string, outcome: string | null) =>
    t === "Request sent" ||
    t === "Message sent" ||
    t === "InMail sent" ||
    t === "Task done" ||
    (t === "Call" && outcome !== null);

  const planIds = [
    ...new Set([
      ...enrolments.map((e) => e.planId),
      ...linked.filter((a) => inPeriod(a.at)).map((a) => a.planId),
    ]),
  ];
  const names = planIds.length
    ? await db.select({ id: plan.id, name: plan.name }).from(plan).where(inArray(plan.id, planIds))
    : [];
  return planIds
    .map((planId) => {
      const mine = enrolments.filter((e) => e.planId === planId);
      const replied = mine.filter((e) => repliedIds.has(e.id)).length;
      const converted = mine.filter(
        (e) => e.converted && e.convertedDate && e.convertedDate >= toIstDate(e.startedAt),
      ).length;
      const acts = linked.filter((a) => a.planId === planId && inPeriod(a.at) && a.order !== null);
      const orders = [...new Set(acts.map((a) => a.order!))].sort((a, b) => a - b);
      return {
        planId,
        name: names.find((n) => n.id === planId)?.name ?? "Plan",
        enrolled: mine.length,
        replied,
        converted,
        replyRate: mine.length ? replied / mine.length : null,
        steps: orders.map((order) => {
          const done = acts.filter((a) => a.order === order && touch(a.type, a.outcome)).length;
          const replies = acts.filter(
            (a) => a.order === order && a.type === "Reply received",
          ).length;
          return { order, done, replies, rate: done ? replies / done : null };
        }),
      };
    })
    .sort((a, b) => b.enrolled - a.enrolled || a.name.localeCompare(b.name));
}
