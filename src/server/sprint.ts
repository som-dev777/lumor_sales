// Outreach sprints (F30, D-065): Sales Hub picks who's next, writes the note or message, and the
// rep sends it on LinkedIn themselves (never a bot). Sent ✓ logs it through the plan, exactly as a
// plan step or Mark as sent would: permission check, the change and its audit in one transaction.
import { and, asc, desc, eq, gte, inArray, lt, notExists, or, isNull, lte, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { DeskChannel, DeskTask } from "@/lib/db/enums";
import {
  activity,
  company,
  deskEntry,
  person,
  persona,
  plan,
  planEnrolment,
  type DeskOption,
} from "@/lib/db/schema";
import { profileHref } from "@/lib/linkedin";
import type { Actor } from "@/lib/permissions";
import { istDayRange, istWeekRange, todayIst } from "@/lib/time";
import { placeholdersIn } from "@/lib/validation/library";
import { editLevel, loadOwnLead } from "./ai/assist";
import { draftOnDesk, markDeskSent, setDeskFields } from "./ai/desk";
import { LeadError } from "./leads/companies";
import { getPlaybookSettings } from "./leads/quicklog";
import { OUTREACH_TYPES } from "./outreach";
import {
  enrolPeople,
  liveEnrolment,
  logWithPlan,
  logWithPlanTx,
  planStatesFor,
  stopPlanTx,
} from "./plans/enrolment";

/** LinkedIn's limit for a connection note. */
export const NOTE_MAX = 300;
/** The weekly connection limit is this many days of the daily target (100 by default). */
export const WEEKLY_DAYS = 5;

export type SprintKind = "connect" | "first" | "next" | "reply";

export type SprintDraft = { id: string; options: DeskOption[] };

export type SprintCard = {
  personId: string;
  kind: SprintKind;
  channel: DeskChannel;
  name: string;
  title: string | null;
  company: string | null;
  persona: string | null;
  tier: number | null;
  brief: string | null;
  profileUrl: string | null;
  /** What this card is for: "Step 3 of 5: LinkedIn message", "Book the demo"… */
  label: string;
  /** Their last message, for a reply card. */
  theySaid: string | null;
  draft: SprintDraft | null;
};

export type SprintLimits = {
  dailyTarget: number;
  sentToday: number;
  weeklyLimit: number;
  sentWeek: number;
  /** How many more requests this sprint offers: the day's target left, within the week's limit. */
  left: number;
};

// --- Limits -------------------------------------------------------------------------------------

export async function sprintLimits(db: DbOrTx, actor: Actor, now = new Date()) {
  const settings = await getPlaybookSettings(db);
  const sent = async (range: { start: Date; end: Date }) =>
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(activity)
        .where(
          and(
            eq(activity.userId, actor.id),
            eq(activity.type, "Request sent"),
            gte(activity.occurredAt, range.start),
            lt(activity.occurredAt, range.end),
          ),
        )
    )[0].n;
  const dailyTarget = settings.dailyConnectionTarget;
  const weeklyLimit = dailyTarget * WEEKLY_DAYS;
  const [sentToday, sentWeek] = await Promise.all([
    sent(istDayRange(todayIst(now))),
    sent(istWeekRange(now)),
  ]);
  const left = Math.max(0, Math.min(dailyTarget - sentToday, weeklyLimit - sentWeek));
  return { dailyTarget, sentToday, weeklyLimit, sentWeek, left } satisfies SprintLimits;
}

// --- Who's next ---------------------------------------------------------------------------------

const cardColumns = {
  p: person,
  companyName: company.name,
  personaName: persona.name,
  tier: persona.tier,
};

type CardRow = {
  p: typeof person.$inferSelect;
  companyName: string | null;
  personaName: string | null;
  tier: number | null;
};

function cardFrom(
  r: CardRow,
  kind: SprintKind,
  channel: DeskChannel,
  label: string,
  theySaid: string | null = null,
): SprintCard {
  const link = r.p.salesNavUrl || r.p.linkedinUrl;
  return {
    personId: r.p.id,
    kind,
    channel,
    name: r.p.fullName,
    title: r.p.title,
    company: r.companyName,
    persona: r.personaName,
    tier: r.tier,
    brief: r.p.brief,
    profileUrl: link ? profileHref(link) : null,
    label,
    theySaid,
    draft: null,
  };
}

export type ConnectFilters = { personaId?: string | null; accountFilterId?: string | null };

/**
 * The connection sprint: your people never contacted, not Do not contact, Lost or in Nurture, on
 * no plan or at a plan's connection request step. Tier 1 personas first, oldest added first, up
 * to the day's target left within the week's limit.
 */
export async function connectionQueue(
  db: DbOrTx,
  actor: Actor,
  filters: ConnectFilters = {},
  now = new Date(),
) {
  const limits = await sprintLimits(db, actor, now);
  const today = todayIst(now);
  if (limits.left === 0) return { limits, cards: [] as SprintCard[] };
  const rows = await db
    .select(cardColumns)
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(
      and(
        eq(person.ownerId, actor.id),
        eq(person.doNotContact, false),
        sql`${person.stage} <> 'Lost'`,
        or(isNull(person.nurtureUntil), lte(person.nurtureUntil, today)),
        filters.personaId ? eq(person.personaId, filters.personaId) : undefined,
        filters.accountFilterId ? eq(person.accountFilterId, filters.accountFilterId) : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(activity)
            .where(
              and(eq(activity.personId, person.id), inArray(activity.type, [...OUTREACH_TYPES])),
            ),
        ),
      ),
    )
    .orderBy(sql`coalesce(${persona.tier}, 9)`, asc(person.createdAt))
    .limit(limits.left + 100);
  const states = await planStatesFor(
    db,
    rows.map((r) => r.p),
    today,
  );
  const cards = rows
    .filter((r) => {
      const s = states.get(r.p.id);
      if (!s) return true;
      return (
        s.enrolment.status === "Active" &&
        !s.enrolment.waitingForAcceptance &&
        s.channel === "LinkedIn connection request"
      );
    })
    .slice(0, limits.left)
    .map((r) => cardFrom(r, "connect", "LinkedIn connection note", "Connection request"));
  return { limits, cards };
}

export type WaitingRow = {
  personId: string;
  name: string;
  company: string | null;
  profileUrl: string | null;
  sentOn: Date;
};

const REQUEST_TYPES = ["Request sent", "Request accepted", "Request withdrawn"] as const;
const BOOK_TYPES = ["Interested", "Asking for details"] as const;

/** The latest activity of the given types for each of the people. */
async function latestOf(db: DbOrTx, actor: Actor, types: string[]) {
  const rows = await db
    .select({
      personId: activity.personId,
      type: activity.type,
      occurredAt: activity.occurredAt,
      content: activity.content,
      replyType: activity.replyType,
    })
    .from(activity)
    .innerJoin(person, eq(person.id, activity.personId))
    .where(
      and(
        eq(person.ownerId, actor.id),
        eq(person.doNotContact, false),
        sql`${person.stage} <> 'Lost'`,
        inArray(activity.type, types as (typeof activity.$inferSelect)["type"][]),
      ),
    )
    .orderBy(asc(activity.occurredAt), asc(activity.createdAt));
  const last = new Map<string, (typeof rows)[number]>();
  for (const r of rows) last.set(r.personId, r);
  return last;
}

async function cardRows(db: DbOrTx, ids: string[]) {
  if (ids.length === 0) return [] as CardRow[];
  return db
    .select(cardColumns)
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(inArray(person.id, ids));
}

/**
 * The follow-up sprint: who's waiting for an acceptance; then plan messages due today or
 * overdue; then replies not answered yet: Interested / Asking for details (Book the demo) and
 * replies with no reply type (Answer the reply, D-066).
 */
export async function followUpQueue(db: DbOrTx, actor: Actor, now = new Date()) {
  const today = todayIst(now);
  // Waiting for an acceptance: their last request event is a request sent.
  const requests = await latestOf(db, actor, [...REQUEST_TYPES]);
  const waitingIds = [...requests.values()]
    .filter((r) => r.type === "Request sent")
    .map((r) => r.personId);
  const waitingRows = await cardRows(db, waitingIds);
  const accepted = new Set(
    waitingRows
      .filter((r) => ["Replied", "Meeting scheduled", "Meeting done"].includes(r.p.stage))
      .map((r) => r.p.id),
  );
  const waiting: WaitingRow[] = waitingRows
    .filter((r) => !accepted.has(r.p.id))
    .map((r) => {
      const link = r.p.salesNavUrl || r.p.linkedinUrl;
      return {
        personId: r.p.id,
        name: r.p.fullName,
        company: r.companyName,
        profileUrl: link ? profileHref(link) : null,
        sentOn: requests.get(r.p.id)!.occurredAt,
      };
    })
    .sort((a, b) => a.sentOn.getTime() - b.sentOn.getTime());

  // Plan messages due.
  const onPlans = await db
    .select(cardColumns)
    .from(person)
    .innerJoin(planEnrolment, eq(planEnrolment.personId, person.id))
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(
      and(
        eq(person.ownerId, actor.id),
        eq(person.doNotContact, false),
        eq(planEnrolment.status, "Active"),
        eq(planEnrolment.waitingForAcceptance, false),
        lte(planEnrolment.nextDueDate, today),
      ),
    )
    .orderBy(asc(planEnrolment.nextDueDate));
  const states = await planStatesFor(
    db,
    onPlans.map((r) => r.p),
    today,
  );
  const sentBefore = new Set(
    onPlans.length
      ? (
          await db
            .select({ personId: activity.personId })
            .from(activity)
            .where(
              and(
                inArray(
                  activity.personId,
                  onPlans.map((r) => r.p.id),
                ),
                inArray(activity.type, ["Message sent", "InMail sent"]),
              ),
            )
        ).map((r) => r.personId)
      : [],
  );
  const cards: SprintCard[] = [];
  for (const r of onPlans) {
    const s = states.get(r.p.id);
    if (!s?.step || !(s.dueToday || s.overdue)) continue;
    if (s.channel !== "LinkedIn message" && s.channel !== "InMail") continue;
    const label = `Step ${s.enrolment.currentStep} of ${s.steps.length}: ${s.channel}`;
    cards.push(
      cardFrom(
        r,
        sentBefore.has(r.p.id) ? "next" : "first",
        s.channel === "InMail" ? "LinkedIn InMail" : "LinkedIn message",
        label,
      ),
    );
  }

  // Replies to answer with the demo.
  const talk = await latestOf(db, actor, [
    "Reply received",
    "Message sent",
    "InMail sent",
    "Call",
    "Meeting booked",
  ]);
  // Interested / Asking for details: Book the demo. No reply type yet (as Gmail logs them,
  // D-066): Answer the reply.
  const toAnswer = [...talk.values()].filter(
    (r) =>
      r.type === "Reply received" &&
      (!r.replyType || (BOOK_TYPES as readonly string[]).includes(r.replyType)),
  );
  const answerRows = await cardRows(
    db,
    toAnswer.map((r) => r.personId),
  );
  for (const r of answerRows) {
    if (cards.some((c) => c.personId === r.p.id)) continue;
    if (["Meeting scheduled", "Meeting done", "Proposal sent", "Trial", "Paid"].includes(r.p.stage))
      continue;
    cards.push(
      cardFrom(
        r,
        "reply",
        "LinkedIn message",
        talk.get(r.p.id)?.replyType ? "Book the demo" : "Answer the reply",
        talk.get(r.p.id)?.content ?? null,
      ),
    );
  }
  return { waiting, cards };
}

// --- Drafts -------------------------------------------------------------------------------------

const TASK_OF: Record<SprintKind, DeskTask> = {
  connect: "first",
  first: "first",
  next: "next",
  reply: "reply",
};

/**
 * The note or message for a card: an unsent draft made since their last activity, or a new one
 * from the Outreach Desk (P11). Owner or Admin only (checked by the Desk).
 */
export async function draftFor(
  db: Db,
  actor: Actor,
  personId: string,
  kind: SprintKind,
  channel: DeskChannel,
): Promise<SprintDraft> {
  await loadOwnLead(db, actor, personId);
  const [last] = await db
    .select({ at: activity.createdAt })
    .from(activity)
    .where(
      and(
        eq(activity.personId, personId),
        inArray(activity.type, [...OUTREACH_TYPES, "Reply received"]),
      ),
    )
    .orderBy(desc(activity.createdAt))
    .limit(1);
  const [kept] = await db
    .select({ id: deskEntry.id, options: deskEntry.options })
    .from(deskEntry)
    .where(
      and(
        eq(deskEntry.personId, personId),
        eq(deskEntry.kind, "draft"),
        eq(deskEntry.channel, channel),
        eq(deskEntry.task, TASK_OF[kind]),
        last ? gte(deskEntry.createdAt, last.at) : undefined,
      ),
    )
    .orderBy(desc(deskEntry.createdAt))
    .limit(1);
  if (kept?.options?.length) return { id: kept.id, options: kept.options };
  const row = await draftOnDesk(db, actor, personId, { task: TASK_OF[kind], channel });
  return { id: row.id, options: row.options ?? [] };
}

// --- Sent, Accepted, Not a fit ------------------------------------------------------------------

export type SprintSend = {
  kind: SprintKind;
  text: string;
  draftId?: string | null;
  optionIndex?: number | null;
  override?: boolean;
};

/** The note or message the rep will send: checked before anything is logged. */
export function checkSprintText(kind: SprintKind, text: string) {
  const t = text.trim();
  if (!t) throw new LeadError(kind === "connect" ? "Write the note first." : "Write the message.");
  if (kind === "connect" && t.length > NOTE_MAX) {
    throw new LeadError(
      `LinkedIn notes are ${NOTE_MAX} characters at most. This one is ${t.length}.`,
    );
  }
  const left = placeholdersIn(t);
  if (left.length) throw new LeadError(`Fill in {${left[0]}} first.`);
  return t;
}

/** Official Outreach, else the first Official active Outreach plan. */
async function outreachPlanId(db: DbOrTx) {
  const rows = await db
    .select({ id: plan.id, name: plan.name })
    .from(plan)
    .where(and(eq(plan.type, "Official"), eq(plan.status, "Active"), eq(plan.planType, "Outreach")))
    .orderBy(asc(plan.createdAt));
  return (rows.find((r) => r.name === "Official Outreach") ?? rows[0])?.id ?? null;
}

async function latestOutreach(tx: DbOrTx, personId: string) {
  const [row] = await tx
    .select({ id: activity.id, type: activity.type })
    .from(activity)
    .where(and(eq(activity.personId, personId), inArray(activity.type, [...OUTREACH_TYPES])))
    .orderBy(desc(activity.createdAt))
    .limit(1);
  return row;
}

async function creditDraft(
  tx: DbOrTx,
  actor: Actor,
  activityId: string,
  channel: DeskChannel,
  draft: { id: string; option?: DeskOption; index: number } | null,
  text: string,
) {
  await setDeskFields(tx, actor, activityId, {
    deskChannel: channel,
    ...(draft?.option
      ? {
          fromDraftId: draft.id,
          optionIndex: draft.index,
          aiSuggestionUsed: true,
          suggestionApproach: draft.option.label.slice(0, 100) || null,
          editLevel: editLevel(draft.option.text, text),
        }
      : {}),
  });
}

async function draftOption(db: DbOrTx, personId: string, s: SprintSend) {
  if (!s.draftId) return null;
  const [d] = await db.select().from(deskEntry).where(eq(deskEntry.id, s.draftId));
  if (!d || d.personId !== personId || d.kind !== "draft") return null;
  const index = s.optionIndex ?? 0;
  return { id: d.id, option: d.options?.[index], index };
}

/**
 * Sent ✓. A connection request: someone on no plan is put on the Official Outreach plan first, so
 * the request is its first step and the plan waits for acceptance; the week's limit is checked
 * on the server. A plan message: does the plan step. A reply: logged as the Desk's Mark as sent.
 */
export async function sprintSent(
  db: Db,
  actor: Actor,
  personId: string,
  s: SprintSend,
  now = new Date(),
) {
  const text = checkSprintText(s.kind, s.text);
  const p = await loadOwnLead(db, actor, personId);
  const today = todayIst(now);

  if (s.kind === "reply") {
    if (!s.draftId) throw new LeadError("Draft the reply first.");
    return markDeskSent(
      db,
      actor,
      personId,
      { source: "desk", draftId: s.draftId, optionIndex: s.optionIndex ?? 0, text },
      now,
    );
  }

  if (s.kind === "connect") {
    const limits = await sprintLimits(db, actor, now);
    if (limits.sentWeek >= limits.weeklyLimit) {
      throw new LeadError(
        `You've sent ${limits.sentWeek} connection requests this week, the limit of ${limits.weeklyLimit}. ` +
          "More could get your LinkedIn account restricted; carry on next week.",
      );
    }
    if (!(await liveEnrolment(db, personId))) {
      const planId = await outreachPlanId(db);
      if (planId) await enrolPeople(db, actor, [personId], planId, now);
    }
  }

  const draft = await draftOption(db, personId, s);
  const channel: DeskChannel =
    s.kind === "connect"
      ? "LinkedIn connection note"
      : ((
          await db
            .select({ channel: deskEntry.channel })
            .from(deskEntry)
            .where(eq(deskEntry.id, s.draftId ?? ""))
        )[0]?.channel ?? "LinkedIn message");

  return db.transaction(async (tx) => {
    const state = (await planStatesFor(tx, [p], today)).get(personId);
    const atStep =
      state?.enrolment.status === "Active" &&
      !state.enrolment.waitingForAcceptance &&
      (s.kind === "connect"
        ? state.channel === "LinkedIn connection request"
        : state.channel === "LinkedIn message" || state.channel === "InMail");
    if (s.kind !== "connect" && !atStep) {
      throw new LeadError(`${p.fullName}'s plan has no message step due. Open their page.`);
    }
    await logWithPlanTx(
      tx,
      actor,
      personId,
      s.kind === "connect"
        ? { action: "requestSent", withNote: true }
        : { action: "messageSent", channel: state?.channel === "InMail" ? "InMail" : "LinkedIn" },
      { note: text, now, asStep: atStep, override: Boolean(s.override) },
    );
    const logged = await latestOutreach(tx, personId);
    if (logged) await creditDraft(tx, actor, logged.id, channel, draft, text);
    return logged;
  });
}

/** Accepted: logs the acceptance; the plan's next step is dated from today (D-060). */
export async function sprintAccepted(db: Db, actor: Actor, personId: string, now = new Date()) {
  return logWithPlan(db, actor, personId, { action: "accepted" }, { now });
}

/** Not a fit: their plan stops and they're marked Lost (Wrong person), in one transaction. */
export async function sprintNotAFit(db: Db, actor: Actor, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await loadOwnLead(tx, actor, personId);
    await stopPlanTx(tx, actor, personId, "Not a fit", now);
    return logWithPlanTx(
      tx,
      actor,
      personId,
      { action: "markLost", lostReason: "Wrong person" },
      { now },
    );
  });
}
