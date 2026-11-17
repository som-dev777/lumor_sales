// New outreach and follow-ups (D-057, D-063): one rule for My tasks' "new people" bar and the
// reports. The date registered is the only truth: a contact logged today for 13 Nov counts on
// 13 Nov, never today.
//
// New outreach: a person counts once, on the day they first entered our outreach: the day of
// their first contact ever (request, message, InMail or call), or, when they were added in the
// period and nobody had contacted them before it, the day they were added. Someone added today
// whose first contact was registered for an earlier day is that earlier day's new outreach.
// Follow-ups: people contacted in the period who aren't new outreach in it.
import { and, gte, inArray, lt } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { activity, person } from "@/lib/db/schema";

export const OUTREACH_TYPES = ["Request sent", "Message sent", "InMail sent", "Call"] as const;

type Range = { start: Date; end: Date };

/** userId → the people that count as their new outreach in the range (each person once). */
export async function newOutreach(
  db: DbOrTx,
  range: Range,
  userIds?: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (userId: string | null, personId: string) => {
    if (!userId) return;
    if (userIds && !userIds.includes(userId)) return;
    const set = out.get(userId) ?? new Set<string>();
    set.add(personId);
    out.set(userId, set);
  };
  const added = await db
    .select({ id: person.id, by: person.createdBy })
    .from(person)
    .where(and(gte(person.createdAt, range.start), lt(person.createdAt, range.end)));
  const touches = await db
    .select({ personId: activity.personId })
    .from(activity)
    .where(
      and(
        inArray(activity.type, [...OUTREACH_TYPES]),
        gte(activity.occurredAt, range.start),
        lt(activity.occurredAt, range.end),
      ),
    );

  // Each person's first contact ever (up to the end of the range).
  const ids = [
    ...new Set([...added.map((p) => p.id), ...touches.map((t) => t.personId)].filter(Boolean)),
  ] as string[];
  const first = new Map<string, { userId: string; at: Date }>();
  for (let i = 0; i < ids.length; i += 400) {
    const history = await db
      .select({ personId: activity.personId, userId: activity.userId, at: activity.occurredAt })
      .from(activity)
      .where(
        and(
          inArray(activity.type, [...OUTREACH_TYPES]),
          inArray(activity.personId, ids.slice(i, i + 400)),
          lt(activity.occurredAt, range.end),
        ),
      )
      .orderBy(activity.occurredAt);
    for (const h of history) if (h.personId && !first.has(h.personId)) first.set(h.personId, h);
  }

  const counted = new Set<string>();
  // Added in the range and not contacted before it: the person who added them.
  for (const p of added) {
    const f = first.get(p.id);
    if (f && f.at < range.start) continue; // first contact registered for an earlier day
    counted.add(p.id);
    add(p.by, p.id);
  }
  // First contact ever in the range: the person who made it.
  for (const [personId, f] of first) {
    if (counted.has(personId) || f.at < range.start) continue;
    counted.add(personId);
    add(f.userId, personId);
  }
  return out;
}

/**
 * Follow-ups (D-058, D-063): per rep, the people they contacted in the range (request, message,
 * InMail, call) who aren't new outreach in it: people already contacted before.
 */
export async function followUps(
  db: DbOrTx,
  range: Range,
  fresh: Map<string, Set<string>>,
  userIds?: string[],
): Promise<Map<string, Set<string>>> {
  const isNew = new Set([...fresh.values()].flatMap((s) => [...s]));
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
    if (isNew.has(t.personId)) continue;
    const set = out.get(t.userId) ?? new Set<string>();
    set.add(t.personId);
    out.set(t.userId, set);
  }
  return out;
}
