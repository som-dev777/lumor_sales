// When a follow-up was set (D-055). Today counts anything logged after this moment, on or after
// the follow-up's date, as doing it, so the task leaves Today and the backlog.

type FollowUp = { nextAction?: string | null; nextActionDate?: string | null };

/**
 * `{ nextActionSetAt: now }` when the next action or its date changes, else nothing. Spread it into
 * the person update. Uses the real time, like an activity's `createdAt`, which it's compared with.
 */
export function stampFollowUp(before: FollowUp, next: FollowUp, now = new Date()) {
  const changed =
    (next.nextAction !== undefined && (next.nextAction ?? null) !== (before.nextAction ?? null)) ||
    (next.nextActionDate !== undefined &&
      (next.nextActionDate ?? null) !== (before.nextActionDate ?? null));
  return changed ? { nextActionSetAt: now } : {};
}
