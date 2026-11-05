// Events of the day (D-058): company by company, the people who are new or had something happen
// in the period, each with the facts from the data and a short AI summary (P12) of where things
// stand. Built when the report is made and saved with it.
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/lib/db/client";
import { activity, company, person } from "@/lib/db/schema";
import { formatIstDate, toIstDate } from "@/lib/time";
import { runPrompt } from "./ai/client";
import { deskThread, transcript } from "./ai/desk-thread";
import { OUTREACH_TYPES } from "./outreach";

export type EventSummary = { offered: string; theySaid: string; outlook: string; nextStep: string };
export type EventPerson = {
  personId: string;
  name: string;
  title: string | null;
  isNew: boolean;
  stage: string;
  facts: string[];
  summary: EventSummary | null;
};
export type EventCompany = {
  companyId: string | null;
  name: string;
  isNew: boolean;
  people: EventPerson[];
};
export type ReportEvents = {
  counts: {
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

/** The facts line for one person, from their whole history (D-058). */
export function factsFor(
  history: { type: string; at: Date; requestNote: boolean }[],
  p: { stage: string; nextAction: string | null; nextActionDate: string | null },
): string[] {
  const facts: string[] = [];
  const request = history.find((h) => h.type === "Request sent");
  const outreach = history.filter((h) => (OUTREACH_TYPES as readonly string[]).includes(h.type));
  const replies = history.filter((h) => h.type === "Reply received");
  if (request) {
    facts.push(
      `Connection request sent ${day(request.at)}${request.requestNote ? " (with a note)" : ""}`,
    );
  } else if (outreach[0]) {
    facts.push(`First contacted ${day(outreach[0].at)}`);
  }
  if (replies[0]) facts.push(`Talking since ${day(replies[0].at)}`);
  const sent = outreach.filter((h) => h.type !== "Request sent").length;
  if (sent || replies.length) {
    facts.push(
      `${sent} message${sent === 1 ? "" : "s"} or call${sent === 1 ? "" : "s"} from us, ${replies.length} repl${replies.length === 1 ? "y" : "ies"}`,
    );
  }
  facts.push(`Stage: ${p.stage}`);
  facts.push(
    p.nextActionDate
      ? `Follow-up: ${p.nextAction ?? "Follow up"} on ${formatIstDate(p.nextActionDate, "d MMM")}`
      : "No follow-up scheduled",
  );
  return facts;
}

const summarySchema = z.object({
  people: z.array(
    z.object({
      id: z.string(),
      offered: z.string(),
      theySaid: z.string(),
      outlook: z.string(),
      nextStep: z.string(),
    }),
  ),
});

/** Builds Events of the day for the period (and one rep, for a personal report). */
export async function buildEvents(
  db: DbOrTx,
  range: { start: Date; end: Date },
  repId: string | null,
  today: string,
): Promise<ReportEvents> {
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
  const newPeople = await db
    .select({ id: person.id })
    .from(person)
    .where(
      and(
        gte(person.createdAt, range.start),
        lt(person.createdAt, range.end),
        repId ? eq(person.createdBy, repId) : undefined,
      ),
    );
  const acts = await db
    .select({ personId: activity.personId, type: activity.type })
    .from(activity)
    .where(
      and(
        inArray(activity.type, [...INTERACTIONS]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
        repId ? eq(activity.userId, repId) : undefined,
      ),
    );
  const counts = {
    companies: newCompanies.length,
    people: newPeople.length,
    contacts: acts.filter((a) => (OUTREACH_TYPES as readonly string[]).includes(a.type)).length,
    replies: acts.filter((a) => a.type === "Reply received").length,
    meetings: acts.filter((a) => a.type === "Meeting booked" || a.type === "Meeting held").length,
  };
  const freshPeople = new Set(newPeople.map((p) => p.id));
  const freshCompanies = new Set(newCompanies.map((c) => c.id));
  const ids = [...new Set([...freshPeople, ...acts.map((a) => a.personId)])];
  const rows = ids.length
    ? await db
        .select({
          id: person.id,
          name: person.fullName,
          title: person.title,
          stage: person.stage,
          nextAction: person.nextAction,
          nextActionDate: person.nextActionDate,
          companyId: person.companyId,
          companyName: company.name,
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
  const history = kept.length
    ? await db
        .select({
          personId: activity.personId,
          type: activity.type,
          at: activity.occurredAt,
          requestNote: activity.requestNote,
        })
        .from(activity)
        .where(
          and(
            inArray(
              activity.personId,
              kept.map((r) => r.id),
            ),
            lt(activity.occurredAt, range.end),
          ),
        )
        .orderBy(asc(activity.occurredAt))
    : [];
  const people: (EventPerson & { companyId: string | null; companyName: string | null })[] =
    kept.map((r) => ({
      personId: r.id,
      name: r.name,
      title: r.title,
      isNew: freshPeople.has(r.id),
      stage: r.stage,
      facts: factsFor(
        history.filter((h) => h.personId === r.id),
        r,
      ),
      summary: null,
      companyId: r.companyId,
      companyName: r.companyName,
    }));

  // AI summaries for the first EVENT_AI_LIMIT people, in parallel batches, within the time limit.
  const forAi = people.slice(0, EVENT_AI_LIMIT);
  const summaries = await summarise(db, forAi, today);
  for (const p of people) p.summary = summaries.get(p.personId) ?? null;

  // Company by company: new companies first, then by name; companies with nothing else too.
  const byCompany = new Map<string, EventCompany>();
  const keyOf = (id: string | null) => id ?? "none";
  for (const c of newCompanies) {
    byCompany.set(c.id, { companyId: c.id, name: c.name, isNew: true, people: [] });
  }
  for (const { companyId, companyName, ...p } of people) {
    const key = keyOf(companyId);
    if (!byCompany.has(key)) {
      byCompany.set(key, {
        companyId,
        name: companyName ?? "No company",
        isNew: companyId ? freshCompanies.has(companyId) : false,
        people: [],
      });
    }
    byCompany.get(key)!.people.push(p);
  }
  const companies = [...byCompany.values()].sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name),
  );
  return {
    counts,
    companies,
    more: Math.max(0, rows.length - EVENT_PEOPLE_LIMIT),
    withoutSummary: people.filter((p) => !p.summary).length,
  };
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
): Promise<Map<string, EventSummary>> {
  const out = new Map<string, EventSummary>();
  if (people.length === 0) return out;
  try {
    const withTalk = await Promise.all(
      people.map(async (p) => {
        const items = await deskThread(db, { id: "" }, p.personId);
        const talk = transcript(items, p.name, 20);
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
          runPrompt("P12", summarySchema, { TODAY: today, PEOPLE: batch }, () => ({
            people: batch.map((b) => ({
              id: b.id,
              offered:
                b.CONVERSATION === "(nothing yet)"
                  ? ""
                  : "A short demo of Lumor for their research.",
              theySaid: b.FACTS.some((f) => f.startsWith("Talking since"))
                ? "Interested and asked how it works."
                : "",
              outlook: "Early days",
              nextStep:
                b.FACTS.find((f) => f.startsWith("Follow-up:"))?.slice(11) ??
                "Send a short follow-up.",
            })),
          })),
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
        });
      }
    }
  } catch (e) {
    console.error("Report summaries failed:", e instanceof Error ? e.message : e);
  }
  return out;
}
