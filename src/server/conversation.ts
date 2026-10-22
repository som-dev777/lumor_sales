// The conversation thread (F18): every message with who sent it, where and when. Entries go
// through the plan layer, so a reply pauses the plan and a message is a touch at its real date.
// Each entry checks the permission and writes its audit entry in the same transaction.
import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { REPLY_TYPES, ThreadChannel } from "@/lib/db/enums";
import { activity, person, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, formatIst, isIstDate, toIstDate, todayIst } from "@/lib/time";
import { LeadError } from "./leads/companies";
import { loadPerson } from "./leads/people";
import { getPlaybookSettings } from "./leads/quicklog";
import { liveEnrolment, logWithPlanTx } from "./plans/enrolment";

export type { ThreadChannel };

export type Side = "me" | "them" | "note" | "event";
type ReplyType = (typeof REPLY_TYPES)[number];

export type ThreadEntry = {
  from: "me" | "them" | "note";
  channel: ThreadChannel;
  at: Date;
  text: string;
  replyType?: ReplyType | null;
  /** From me: the date a reply is expected by (the rep confirms it; F18). */
  replyBy?: string | null;
};

/** Where an activity sits in the thread: the rep's side, the prospect's, a note, or an event. */
export function sideOf(row: { direction: string | null; type: string }): Side {
  if (row.direction === "out") return "me";
  if (row.direction === "in") return "them";
  return row.type === "Meeting note" ? "note" : "event";
}

/** The whole thread, oldest first. */
export async function threadOf(db: DbOrTx, personId: string) {
  const rows = await db
    .select({
      id: activity.id,
      at: activity.occurredAt,
      type: activity.type,
      channel: activity.channel,
      content: activity.content,
      replyType: activity.replyType,
      direction: activity.direction,
      userId: activity.userId,
      userName: user.name,
      planStepOrder: activity.planStepOrder,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.userId))
    .where(eq(activity.personId, personId))
    .orderBy(asc(activity.occurredAt), asc(activity.createdAt));
  return rows.map((r) => ({ ...r, side: sideOf(r) }));
}
export type ThreadItem = Awaited<ReturnType<typeof threadOf>>[number];

/** The conversation as the AI reads it: messages and notes, oldest first, last 60. */
export function conversationForAi(items: ThreadItem[], prospect: string) {
  return items
    .filter((i) => i.side !== "event")
    .slice(-60)
    .map((i) => ({
      when: formatIst(i.at),
      from:
        i.side === "me"
          ? `Rep (${i.userName ?? "the rep"})`
          : i.side === "them"
            ? `Prospect (${prospect})`
            : "Note",
      channel: i.channel,
      kind: i.type,
      text: i.content ?? "",
      ...(i.replyType ? { replyType: i.replyType } : {}),
    }));
}

// --- What to do next ----------------------------------------------------------------------------

export type SituationKind = "start" | "reply" | "wait" | "nudge" | "close";
export type Situation = {
  kind: SituationKind;
  lastFrom: "me" | "them" | null;
  lastAt: Date | null;
  lastChannel: ThreadChannel | null;
  /** When a reply is expected (wait), or was (nudge, close). */
  until: string | null;
  nudges: number;
  /** The prospect's last message, when it's their turn. */
  replyId: string | null;
};

/**
 * The app, not the AI, decides the situation (D-038): their message last → reply; nothing yet →
 * start; the rep's last → wait until the reply-by date (or the plan's next step, or the minimum
 * gap), then nudge, and after 2 nudges close the loop.
 */
export function computeSituation(c: {
  last: { id: string; direction: "out" | "in"; at: Date; channel: string } | null;
  awaitingReplyUntil: string | null;
  nudgeCount: number;
  planNextDue: string | null;
  today: string;
  minGapDays: number;
}): Situation {
  const base = {
    lastFrom: c.last ? (c.last.direction === "in" ? ("them" as const) : ("me" as const)) : null,
    lastAt: c.last?.at ?? null,
    lastChannel: (c.last?.channel as ThreadChannel | undefined) ?? null,
    nudges: c.nudgeCount,
    replyId: c.last?.direction === "in" ? c.last.id : null,
  };
  if (!c.last) return { ...base, kind: "start", until: null };
  if (c.last.direction === "in") return { ...base, kind: "reply", until: null };
  const until =
    c.awaitingReplyUntil ?? c.planNextDue ?? addDaysIst(toIstDate(c.last.at), c.minGapDays);
  if (until >= c.today) return { ...base, kind: "wait", until };
  return { ...base, kind: c.nudgeCount >= 2 ? "close" : "nudge", until };
}

export async function situationOf(db: DbOrTx, personId: string, today: string) {
  const p = await loadPerson(db, personId);
  const [last] = await db
    .select({
      id: activity.id,
      direction: activity.direction,
      at: activity.occurredAt,
      channel: activity.channel,
    })
    .from(activity)
    .where(and(eq(activity.personId, personId), isNotNull(activity.direction)))
    .orderBy(desc(activity.occurredAt), desc(activity.createdAt))
    .limit(1);
  const e = await liveEnrolment(db, personId);
  const settings = await getPlaybookSettings(db);
  return computeSituation({
    last: last ? { ...last, direction: last.direction as "out" | "in" } : null,
    awaitingReplyUntil: p.awaitingReplyUntil,
    nudgeCount: p.nudgeCount,
    planNextDue: e?.status === "Active" && !e.waitingForAcceptance ? e.nextDueDate : null,
    today,
    minGapDays: settings.minGapDays,
  });
}

// --- Reply-by date ------------------------------------------------------------------------------

/** Checks a reply-by date against the Playbook Settings bounds (1–10 days after `from`). */
export async function checkReplyBy(db: DbOrTx, replyBy: string, from: string) {
  const s = await getPlaybookSettings(db);
  const min = addDaysIst(from, s.replyDeadlineMinDays);
  const max = addDaysIst(from, s.replyDeadlineMaxDays);
  if (!isIstDate(replyBy) || replyBy < min || replyBy > max) {
    throw new LeadError(
      `Pick a reply-by date ${s.replyDeadlineMinDays}–${s.replyDeadlineMaxDays} days after the message.`,
    );
  }
}

/** Saves the confirmed reply-by date (and nudge count) on the person, with its audit entry. */
export async function setAwaiting(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  values: { awaitingReplyUntil?: string | null; nudgeCount?: number },
) {
  const before = await loadPerson(tx, personId);
  const next = {
    awaitingReplyUntil:
      values.awaitingReplyUntil === undefined
        ? before.awaitingReplyUntil
        : values.awaitingReplyUntil,
    nudgeCount: values.nudgeCount ?? before.nudgeCount,
  };
  if (
    next.awaitingReplyUntil === before.awaitingReplyUntil &&
    next.nudgeCount === before.nudgeCount
  ) {
    return;
  }
  await tx.update(person).set(next).where(eq(person.id, personId));
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Person",
    recordId: personId,
    recordName: before.fullName,
    action: "Updated",
    before: { awaitingReplyUntil: before.awaitingReplyUntil, nudgeCount: before.nudgeCount },
    after: next,
  });
}

// --- Adding to the thread -----------------------------------------------------------------------

type EntryOptions = {
  now: Date;
  /** "Yes, this is step N of their plan" (single entries only). */
  asStep?: boolean;
  override?: boolean;
  /** Part of a pasted conversation: history, never a plan step, no guardrail warnings. */
  history?: boolean;
};

/** Adds one message or note to the thread (F18). */
export async function addEntry(
  db: Db,
  actor: Actor,
  personId: string,
  entry: ThreadEntry,
  opts: EntryOptions,
) {
  return db.transaction((tx) => addEntryTx(tx, actor, personId, entry, opts));
}

async function addEntryTx(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  entry: ThreadEntry,
  opts: EntryOptions,
) {
  const text = entry.text.trim();
  if (!text) throw new LeadError("Write the message first.");
  if (text.length > 5000) throw new LeadError("That message is too long (5,000 characters).");
  // A minute's grace for clocks; never in the future.
  if (entry.at.getTime() > opts.now.getTime() + 60_000) {
    throw new LeadError("The time can't be in the future.");
  }
  const at = entry.at;

  if (entry.from === "note") {
    assertCan(actor, "lead.addNote");
    const target = await loadPerson(tx, personId);
    const [row] = await tx
      .insert(activity)
      .values({
        personId,
        companyId: target.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: at,
        type: "Meeting note",
        channel: entry.channel,
        content: text,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: row.id,
      recordName: `Note on ${target.fullName}`,
      action: "Created",
      after: {
        type: row.type,
        channel: row.channel,
        content: row.content,
        person: target.fullName,
      },
    });
    return row;
  }

  const p = await loadPerson(tx, personId);
  assertCan(actor, "lead.edit", p);
  if (entry.from === "me" && p.doNotContact) {
    throw new LeadError(`${p.fullName} is marked Do not contact. Outreach can't be logged.`);
  }
  const history = Boolean(opts.history) || toIstDate(at) < todayIst(opts.now);
  let row: typeof activity.$inferSelect | null;

  if (entry.from === "them") {
    ({ activity: row } = await logWithPlanTx(
      tx,
      actor,
      personId,
      { action: "gotReply", replyType: entry.replyType ?? null, channel: entry.channel },
      { note: text, now: at },
    ));
  } else if (entry.channel === "In person") {
    // What the rep said in a meeting: part of the conversation, not a plan touch.
    [row] = await tx
      .insert(activity)
      .values({
        personId,
        companyId: p.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: at,
        type: "Meeting note",
        channel: "In person",
        direction: "out",
        content: text,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: row.id,
      recordName: `Meeting with ${p.fullName}`,
      action: "Created",
      after: { type: row.type, channel: row.channel, direction: "out", person: p.fullName },
    });
  } else {
    ({ activity: row } = await logWithPlanTx(
      tx,
      actor,
      personId,
      entry.channel === "Call"
        ? { action: "callLogged", outcome: "Connected" }
        : { action: "messageSent", channel: entry.channel },
      {
        note: text,
        now: at,
        asStep: Boolean(opts.asStep) && !opts.history,
        override: opts.override,
        history,
      },
    ));
  }

  if (entry.from === "me" && entry.replyBy) {
    await checkReplyBy(tx, entry.replyBy, toIstDate(at));
    const [later] = await tx
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.personId, personId),
          isNotNull(activity.direction),
          gt(activity.occurredAt, at),
        ),
      )
      .limit(1);
    // Only the latest message sets what the rep is waiting for.
    if (!later) await setAwaiting(tx, actor, personId, { awaitingReplyUntil: entry.replyBy });
  }
  return row;
}

/** Saves a reviewed, pasted conversation (F18) in time order, in one transaction. */
export async function addEntries(
  db: Db,
  actor: Actor,
  personId: string,
  entries: ThreadEntry[],
  now: Date,
) {
  if (entries.length === 0) throw new LeadError("Tick at least one message to save.");
  if (entries.length > 100) throw new LeadError("Save at most 100 messages at a time.");
  const sorted = [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
  return db.transaction(async (tx) => {
    for (const e of sorted) {
      await addEntryTx(tx, actor, personId, { ...e, replyBy: null }, { now, history: true });
    }
    return sorted.length;
  });
}

/** Same side and same words (spaces and case ignored) as a message already in the thread. */
export function isDuplicate(
  items: { side: Side; content: string | null }[],
  from: "me" | "them",
  text: string,
) {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const t = norm(text);
  return items.some(
    (i) => i.side === from && i.content !== null && norm(i.content).includes(t) && t.length > 0,
  );
}
