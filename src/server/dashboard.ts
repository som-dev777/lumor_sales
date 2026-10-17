// Dashboard funnel (F11): stages counted from activities dated inside the period (PRD,
// D-020), conversions against benchmarks, and breakdowns.
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { accountFilter, activity, person, persona, template, user } from "@/lib/db/schema";
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
  { key: "requests", label: "Requests sent" },
  { key: "accepted", label: "Accepted" },
  { key: "replied", label: "Replied" },
  { key: "interested", label: "Interested" },
  { key: "demoBooked", label: "Demo booked" },
  { key: "demoHeld", label: "Demo held" },
  { key: "trial", label: "Trial" },
  { key: "paid", label: "Paid" },
] as const;
export type StageKey = (typeof FUNNEL_STAGES)[number]["key"];
export type Counts = Record<StageKey, number>;

/** PRD benchmarks. */
export const CONVERSIONS = [
  { from: "requests", to: "accepted", label: "Requests → Accepted", benchmark: 0.3 },
  { from: "accepted", to: "replied", label: "Accepted → Replied", benchmark: 0.1 },
  { from: "interested", to: "demoBooked", label: "Interested → Demo booked", benchmark: 0.5 },
  { from: "demoBooked", to: "demoHeld", label: "Demo booked → Demo held", benchmark: 0.7 },
  { from: "demoHeld", to: "trial", label: "Demo held → Trial", benchmark: 0.3 },
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
  requests: 0,
  accepted: 0,
  replied: 0,
  interested: 0,
  demoBooked: 0,
  demoHeld: 0,
  trial: 0,
  paid: 0,
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
          "Request accepted",
          "Reply received",
          "Demo booked",
          "Demo held",
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
    if (r.type === "Request sent") events.push({ stage: "requests", ...b });
    else if (r.type === "Request accepted") events.push({ stage: "accepted", ...b });
    else if (r.type === "Demo booked") events.push({ stage: "demoBooked", ...b });
    else if (r.type === "Demo held") events.push({ stage: "demoHeld", ...b });
    else if (r.type === "Stage change" && r.content?.includes("→ Trial/Pilot"))
      events.push({ stage: "trial", ...b });
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
          : b.counts.requests - a.counts.requests || a.label.localeCompare(b.label),
    );
  return { period, totals, conversions: conversions(totals), breakdown };
}
