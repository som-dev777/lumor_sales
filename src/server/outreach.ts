// New outreach (D-057): one rule for Today's "new people" bar and the reports' New outreach.
// Per rep, each person they added in the range, sent a connection request to in it, or contacted
// for the first time in it (any outreach: request, message, InMail, call), counted once.
import { and, gte, inArray, lt } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { activity, person } from "@/lib/db/schema";

export const OUTREACH_TYPES = ["Request sent", "Message sent", "InMail sent", "Call"] as const;

type Range = { start: Date; end: Date };

/** userId → the people that count as their new outreach in the range. */
export async function newOutreach(
  db: DbOrTx,
  range: Range,
  userIds?: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (userId: string | null, personId: string | null) => {
    if (!userId || !personId) return;
    if (userIds && !userIds.includes(userId)) return;
    const set = out.get(userId) ?? new Set<string>();
    set.add(personId);
    out.set(userId, set);
  };
  const added = await db
    .select({ id: person.id, by: person.createdBy })
    .from(person)
    .where(and(gte(person.createdAt, range.start), lt(person.createdAt, range.end)));
  for (const p of added) add(p.by, p.id);

  const touches = await db
    .select({ personId: activity.personId, userId: activity.userId, type: activity.type })
    .from(activity)
    .where(
      and(
        inArray(activity.type, [...OUTREACH_TYPES]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
      ),
    );
  for (const t of touches) if (t.type === "Request sent") add(t.userId, t.personId);

  // First contact ever, when it falls in the range.
  const touched = [...new Set(touches.map((t) => t.personId).filter(Boolean))] as string[];
  for (let i = 0; i < touched.length; i += 400) {
    const history = await db
      .select({ personId: activity.personId, userId: activity.userId, at: activity.occurredAt })
      .from(activity)
      .where(
        and(
          inArray(activity.type, [...OUTREACH_TYPES]),
          inArray(activity.personId, touched.slice(i, i + 400)),
          lt(activity.occurredAt, range.end),
        ),
      )
      .orderBy(activity.occurredAt);
    const first = new Map<string, { userId: string; at: Date }>();
    for (const h of history) if (h.personId && !first.has(h.personId)) first.set(h.personId, h);
    for (const [personId, f] of first) if (f.at >= range.start) add(f.userId, personId);
  }
  return out;
}

/**
 * Follow-ups (D-058): per rep, the people they contacted in the range (request, message, InMail,
 * call) who aren't their new outreach in it: people already contacted before.
 */
export async function followUps(
  db: DbOrTx,
  range: Range,
  fresh: Map<string, Set<string>>,
  userIds?: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const touches = await db
    .select({ personId: activity.personId, userId: activity.userId })
    .from(activity)
    .where(
      and(
        inArray(activity.type, [...OUTREACH_TYPES]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
      ),
    );
  for (const t of touches) {
    if (!t.personId || (userIds && !userIds.includes(t.userId))) continue;
    if (fresh.get(t.userId)?.has(t.personId)) continue;
    const set = out.get(t.userId) ?? new Set<string>();
    set.add(t.personId);
    out.set(t.userId, set);
  }
  return out;
}
