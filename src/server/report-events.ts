// Events of the day (D-058, D-063): company by company, the people who are new outreach or had
// something happen in the period, each with the facts of the period and a short AI summary (P12)
// of where things stand. Only what was registered for a date inside the period is in it: a
// contact logged today for 13 Nov is in 13 Nov's events, not today's. The AI also reads each
// conversation for a demo being set up (even a tentative date): those count as Demos scheduled.
// Built when the report is made and saved with it.
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/lib/db/client";
import { activity, company, person } from "@/lib/db/schema";
import { formatIstDate, toIstDate } from "@/lib/time";
import { runPrompt } from "./ai/client";
import { deskThread, transcript } from "./ai/desk-thread";
import { newOutreach, OUTREACH_TYPES } from "./outreach";

export type EventSummary = { offered: string; theySaid: string; outlook: string; nextStep: string };
export type EventPerson = {
  personId: string;
  name: string;
  title: string | null;
  /** New outreach in the period (D-063). */
  isNew: boolean;
  stage: string;
  facts: string[];
  summary: EventSummary | null;
  /** A demo was booked or set up in the period's conversation (D-063; missing before 2.15). */
  demoScheduled?: boolean;
};
export type EventCompany = {
  companyId: string | null;
  name: string;
  isNew: boolean;
  people: EventPerson[];
};
export type ReportEvents = {
  /** The day's counts: shown on reports made before 2.15 only (removed in D-063). */
  counts?: {
    companies: number;
    people: number;
    contacts: number;
    replies: number;
    meetings: number;
  };
  companies: EventCompany[];
  /** People left out after EVENT_PEOPLE_LIMIT. */
  more: number;
  /** People shown without an AI summary (over the AI limit, or the AI was off or slow). */
  withoutSummary: number;
};

export const EVENT_PEOPLE_LIMIT = 200;
/** How many people get an AI summary, and how many go in one AI call (calls run in parallel). */
export const EVENT_AI_LIMIT = 60;
const EVENT_AI_BATCH = 15;
/** Generating must stay well inside the hosting time limit: past this, facts only. */
const EVENT_AI_WAIT_MS = 20_000;
const TRANSCRIPT_CHARS = 3000;
const INTERACTIONS = [
  ...OUTREACH_TYPES,
  "Reply received",
  "Meeting booked",
  "Meeting held",
  "Meeting note",
] as const;

const day = (d: Date) => formatIstDate(toIstDate(d), "d MMM");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What happened with one person in the period, in a few words each (D-063). */
export function periodFacts(
  inPeriod: { type: string; requestNote: boolean }[],
  oneDay: boolean,
): string | null {
  const count = (...types: string[]) => inPeriod.filter((h) => types.includes(h.type)).length;
  const requests = count("Request sent");
  const sent = count("Message sent", "InMail sent", "Call");
  const replies = count("Reply received");
  const booked = count("Meeting booked");
  const held = count("Meeting held");
  const parts = [
    requests
      ? `${plural(requests, "connection request", "connection requests")}${inPeriod.some((h) => h.type === "Request sent" && h.requestNote) ? " (with a note)" : ""}`
      : null,
    sent ? `${plural(sent, "message or call", "messages or calls")} from us` : null,
    replies ? plural(replies, "reply", "replies") : null,
    booked ? plural(booked, "meeting booked", "meetings booked") : null,
    held ? plural(held, "meeting held", "meetings held") : null,
  ].filter(Boolean);
  return parts.length ? `${oneDay ? "On the day" : "In this period"}: ${parts.join(", ")}` : null;
}

/**
 * The facts line for one person (D-063): only what happened in the period, then where they
 * stand now. `firstContact` is their first contact ever (for new outreach).
 */
export function factsFor(
  inPeriod: { type: string; requestNote: boolean }[],
  p: { stage: string; nextAction: string | null; nextActionDate: string | null },
  opts: {
    isNew: boolean;
    addedAt: Date;
    firstContact: Date | null;
    oneDay: boolean;
    demo?: { scheduled: boolean; date: string | null };
  },
): string[] {
  const facts: string[] = [];
  if (opts.isNew) {
    facts.push(
      opts.firstContact
        ? `New outreach: first contacted ${day(opts.firstContact)}`
        : `New outreach: added ${day(opts.addedAt)}, not contacted yet`,
    );
  }
  const happened = periodFacts(inPeriod, opts.oneDay);
  if (happened) facts.push(happened);
  if (opts.demo?.scheduled) {
    facts.push(opts.demo.date ? `Demo scheduled: ${opts.demo.date}` : "Demo scheduled");
  }
  facts.push(`Stage: ${p.stage}`);
  facts.push(
    p.nextActionDate
      ? `Follow-up: ${p.nextAction ?? "Follow up"} on ${formatIstDate(p.nextActionDate, "d MMM")}`
      : "No follow-up scheduled",
  );
  return facts;
}

const MONTH = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DEMO_WORDS = /\b(demo|walk ?-?through)\b/i;
const WHEN_WORDS = new RegExp(
  [
    "\\b(today|tomorrow|tmrw|day after|next week|this week|later this week)\\b",
    "\\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\\b",
    `\\b\\d{1,2}(st|nd|rd|th)?\\s*(of\\s+)?(${MONTH})[a-z]*\\b`,
    `\\b(${MONTH})[a-z]*\\s+\\d{1,2}\\b`,
    "\\b\\d{1,2}(:\\d{2})?\\s*(am|pm)\\b",
    "\\b\\d{1,2}[/-]\\d{1,2}\\b",
  ].join("|"),
  "i",
);

/**
 * A demo being set up, without the AI (D-063): a message in the period that mentions a demo and
 * a day or time. Used when the AI didn't read the person (off, slow or over the limit).
 */
export function mentionsDemo(texts: (string | null)[]): boolean {
  return texts.some((t) => Boolean(t && DEMO_WORDS.test(t) && WHEN_WORDS.test(t)));
}

const summarySchema = z.object({
  people: z.array(
    z.object({
      id: z.string(),
      offered: z.string(),
      theySaid: z.string(),
      outlook: z.string(),
      nextStep: z.string(),
      demoScheduled: z.boolean(),
      demoDate: z.string(),
    }),
  ),
});

type AiResult = EventSummary & { demoScheduled: boolean; demoDate: string };

/** Builds Events of the day for the period (and one rep, for a personal report). */
export async function buildEvents(
  db: DbOrTx,
  range: { start: Date; end: Date },
  repId: string | null,
  today: string,
  span?: { from: string; to: string },
): Promise<ReportEvents & { demoPeople: string[] }> {
  const period = span ?? {
    from: toIstDate(range.start),
    to: toIstDate(new Date(range.end.getTime() - 1)),
  };
  const oneDay = period.from === period.to;
  // New outreach in the period: by the date registered (D-063).
  const fresh = await newOutreach(db, range, repId ? [repId] : undefined);
  const freshPeople = new Set([...fresh.values()].flatMap((s) => [...s]));
  const acts = await db
    .select({
      personId: activity.personId,
      type: activity.type,
      requestNote: activity.requestNote,
      content: activity.content,
    })
    .from(activity)
    .where(
      and(
        inArray(activity.type, [...INTERACTIONS]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
        repId ? eq(activity.userId, repId) : undefined,
      ),
    );
  const ids = [...new Set([...freshPeople, ...acts.map((a) => a.personId)])].filter(
    Boolean,
  ) as string[];
  const rows = ids.length
    ? await db
        .select({
          id: person.id,
          name: person.fullName,
          title: person.title,
          stage: person.stage,
          nextAction: person.nextAction,
          nextActionDate: person.nextActionDate,
          createdAt: person.createdAt,
          companyId: person.companyId,
          companyName: company.name,
          companyCreatedAt: company.createdAt,
        })
        .from(person)
        .leftJoin(company, eq(company.id, person.companyId))
        .where(inArray(person.id, ids))
    : [];
  // New people first, then by name; at most EVENT_PEOPLE_LIMIT.
  rows.sort(
    (a, b) =>
      Number(freshPeople.has(b.id)) - Number(freshPeople.has(a.id)) || a.name.localeCompare(b.name),
  );
  const kept = rows.slice(0, EVENT_PEOPLE_LIMIT);
  const keptIds = kept.map((r) => r.id);
  // First contact ever, for the new outreach line.
  const firstContact = new Map<string, Date>();
  for (let i = 0; i < keptIds.length; i += 400) {
    for (const h of await db
      .select({ personId: activity.personId, at: activity.occurredAt })
      .from(activity)
      .where(
        and(
          inArray(activity.type, [...OUTREACH_TYPES]),
          inArray(activity.personId, keptIds.slice(i, i + 400)),
          lt(activity.occurredAt, range.end),
        ),
      )
      .orderBy(asc(activity.occurredAt))) {
      if (h.personId && !firstContact.has(h.personId)) firstContact.set(h.personId, h.at);
    }
  }
  const inPeriodOf = (id: string) => acts.filter((a) => a.personId === id);
  const people: (EventPerson & {
    companyId: string | null;
    companyName: string | null;
    companyCreatedAt: Date | null;
    base: Parameters<typeof factsFor>;
  })[] = kept.map((r) => {
    const base: Parameters<typeof factsFor> = [
      inPeriodOf(r.id),
      r,
      {
        isNew: freshPeople.has(r.id),
        addedAt: r.createdAt,
        firstContact: firstContact.get(r.id) ?? null,
        oneDay,
      },
    ];
    return {
      personId: r.id,
      name: r.name,
      title: r.title,
      isNew: freshPeople.has(r.id),
      stage: r.stage,
      facts: factsFor(...base),
      summary: null,
      demoScheduled: false,
      companyId: r.companyId,
      companyName: r.companyName,
      companyCreatedAt: r.companyCreatedAt,
      base,
    };
  });

  // AI summaries (and the demo check) for the first EVENT_AI_LIMIT people, in parallel batches,
  // within the time limit.
  const results = await summarise(db, people.slice(0, EVENT_AI_LIMIT), today, period, range.end);
  for (const p of people) {
    const ai = results.get(p.personId);
    p.summary = ai
      ? { offered: ai.offered, theySaid: ai.theySaid, outlook: ai.outlook, nextStep: ai.nextStep }
      : null;
    const own = inPeriodOf(p.personId);
    const booked = own.some((a) => a.type === "Meeting booked");
    const talked = ai ? ai.demoScheduled : mentionsDemo(own.map((a) => a.content));
    p.demoScheduled = booked || talked;
    if (p.demoScheduled) {
      const [list, row, opts] = p.base;
      p.facts = factsFor(list, row, {
        ...opts,
        demo: { scheduled: true, date: ai?.demoScheduled ? ai.demoDate || null : null },
      });
    }
  }

  // New companies: added in the period by the rep, unless all their people belong to other days.
  const newCompanies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(
      and(
        gte(company.createdAt, range.start),
        lt(company.createdAt, range.end),
        repId ? eq(company.createdBy, repId) : undefined,
      ),
    );
  const withPeople = new Set(
    newCompanies.length
      ? (
          await db
            .select({ companyId: person.companyId })
            .from(person)
            .where(
              inArray(
                person.companyId,
                newCompanies.map((c) => c.id),
              ),
            )
        ).map((r) => r.companyId)
      : [],
  );
  const shownPeopleCompanies = new Set(people.map((p) => p.companyId));
  const isNewCompany = (createdAt: Date | null, hasNewPerson: boolean) =>
    Boolean(
      createdAt && createdAt >= range.start && (createdAt < range.end || hasNewPerson), // added later together with a backdated person
    );

  // Company by company: new companies first, then by name.
  const byCompany = new Map<string, EventCompany>();
  const keyOf = (id: string | null) => id ?? "none";
  for (const c of newCompanies) {
    if (withPeople.has(c.id) && !shownPeopleCompanies.has(c.id)) continue;
    byCompany.set(c.id, { companyId: c.id, name: c.name, isNew: true, people: [] });
  }
  for (const { companyId, companyName, companyCreatedAt, base: _base, ...p } of people) {
    const key = keyOf(companyId);
    if (!byCompany.has(key)) {
      byCompany.set(key, {
        companyId,
        name: companyName ?? "No company",
        isNew: false,
        people: [],
      });
    }
    const c = byCompany.get(key)!;
    c.isNew ||= isNewCompany(companyCreatedAt, p.isNew);
    c.people.push(p);
  }
  const companies = [...byCompany.values()].sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name),
  );
  return {
    companies,
    more: Math.max(0, rows.length - EVENT_PEOPLE_LIMIT),
    withoutSummary: people.filter((p) => !p.summary).length,
    demoPeople: people.filter((p) => p.demoScheduled).map((p) => p.personId),
  };
}

/**
 * The conversation up to the end of the period, each entry with its date, for P12 (D-063). Drafts
 * and the rep's AI instructions are left out: only what was said, sent and noted.
 */
function datedTranscript(
  items: Awaited<ReturnType<typeof deskThread>>,
  name: string,
  end: Date,
): string {
  return items
    .filter((i) => i.at < end && (i.kind === "them" || i.kind === "sent" || i.kind === "info"))
    .slice(-20)
    .map((i) => `(${formatIstDate(toIstDate(i.at), "d MMM yyyy")}) ${transcript([i], name, 1)}`)
    .join("\n\n");
}

/** P12 for up to EVENT_AI_LIMIT people. Never throws: on any problem, no summaries. */
async function summarise(
  db: DbOrTx,
  people: {
    personId: string;
    name: string;
    title: string | null;
    stage: string;
    facts: string[];
    companyName: string | null;
  }[],
  today: string,
  period: { from: string; to: string },
  end: Date,
): Promise<Map<string, AiResult>> {
  const out = new Map<string, AiResult>();
  if (people.length === 0) return out;
  try {
    const withTalk = await Promise.all(
      people.map(async (p) => {
        const items = await deskThread(db, { id: "" }, p.personId);
        const talk = datedTranscript(items, p.name, end);
        const inPeriod = items
          .filter(
            (i) =>
              i.at < end &&
              toIstDate(i.at) >= period.from &&
              (i.kind === "them" || i.kind === "sent" || i.kind === "info"),
          )
          .map((i) => ("text" in i ? i.text : null));
        return {
          id: p.personId,
          name: p.name,
          title: p.title,
          company: p.companyName,
          stage: p.stage,
          FACTS: p.facts,
          CONVERSATION:
            talk.length > TRANSCRIPT_CHARS
              ? `…${talk.slice(-TRANSCRIPT_CHARS)}`
              : talk || "(nothing yet)",
          demoTalk: mentionsDemo(inPeriod),
        };
      }),
    );
    const batches: (typeof withTalk)[] = [];
    for (let i = 0; i < withTalk.length; i += EVENT_AI_BATCH) {
      batches.push(withTalk.slice(i, i + EVENT_AI_BATCH));
    }
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), EVENT_AI_WAIT_MS));
    const results = await Promise.race([
      Promise.allSettled(
        batches.map((batch) =>
          runPrompt(
            "P12",
            summarySchema,
            {
              TODAY: today,
              PERIOD: period,
              PEOPLE: batch.map(({ demoTalk: _d, ...b }) => b),
            },
            () => ({
              people: batch.map((b) => ({
                id: b.id,
                offered:
                  b.CONVERSATION === "(nothing yet)"
                    ? ""
                    : "A short demo of Lumor for their research.",
                theySaid: b.CONVERSATION.includes("replied via")
                  ? "Interested and asked how it works."
                  : "",
                outlook: "Early days",
                nextStep:
                  b.FACTS.find((f) => f.startsWith("Follow-up:"))?.slice(11) ??
                  "Send a short follow-up.",
                demoScheduled: b.demoTalk,
                demoDate: "",
              })),
            }),
          ),
        ),
      ),
      timeout,
    ]);
    if (!results) return out;
    const known = new Set(people.map((p) => p.personId));
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const s of r.value.people) {
        if (!known.has(s.id)) continue;
        out.set(s.id, {
          offered: s.offered.trim().slice(0, 300),
          theySaid: s.theySaid.trim().slice(0, 300),
          outlook: s.outlook.trim().slice(0, 120),
          nextStep: s.nextStep.trim().slice(0, 200),
          demoScheduled: s.demoScheduled,
          demoDate: s.demoDate.trim().slice(0, 80),
        });
      }
    }
  } catch (e) {
    console.error("Report summaries failed:", e instanceof Error ? e.message : e);
  }
  return out;
}
