// The calendar link (F20) and Playbook Settings (F13): one row each, read by everyone, edited by
// Admins. Each save is audited with the fields that changed, in the same transaction.
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { playbookSettings, productFacts, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { PlaybookSettingsData } from "@/lib/validation/settings";
import { getPlaybookSettings } from "./leads/quicklog";

export { getPlaybookSettings };

export const PLAYBOOK_FIELDS = [
  "withdrawAfterDays",
  "dailyConnectionTarget",
  "dailyMessageTarget",
  "staleLeadDays",
  "msgAfterAcceptMinDays",
  "msgAfterAcceptMaxDays",
  "minGapDays",
  "maxFollowUps",
  "weeklyTouchLimit",
  "outreachMaxDays",
  "outreachMaxDaysSenior",
  "nurtureDays",
  "replyDeadlineMinDays",
  "replyDeadlineMaxDays",
] as const satisfies readonly (keyof PlaybookSettingsData)[];

const pick = <K extends string>(row: Record<string, unknown>, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, row[k]])) as Record<K, unknown>;

/**
 * The calendar link the AI offers for demos (F20). It lives in the old Product Facts row; the
 * rest of Product Facts was replaced by the AI knowledge base (D-037).
 */
export async function getCalendarLink(db: DbOrTx) {
  const [row] = await db
    .select({
      calendarLink: productFacts.calendarLink,
      at: productFacts.lastEditedAt,
      editorName: user.name,
    })
    .from(productFacts)
    .leftJoin(user, eq(user.id, productFacts.lastEditedBy))
    .where(eq(productFacts.id, 1));
  if (!row) throw new Error("Settings are missing. Run npm run db:migrate.");
  return row;
}

export async function saveCalendarLink(
  db: Db,
  actor: Actor,
  calendarLink: string | null,
  now = new Date(),
) {
  assertCan(actor, "knowledge.edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(productFacts).where(eq(productFacts.id, 1));
    if (before.calendarLink === calendarLink) return before;
    const [after] = await tx
      .update(productFacts)
      .set({ calendarLink, lastEditedBy: actor.id, lastEditedAt: now, updatedAt: now })
      .where(eq(productFacts.id, 1))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Calendar link",
      recordId: "1",
      recordName: "Calendar link",
      action: "Updated",
      before: { calendarLink: before.calendarLink },
      after: { calendarLink: after.calendarLink },
    });
    return after;
  });
}

export async function savePlaybookSettings(
  db: Db,
  actor: Actor,
  data: PlaybookSettingsData,
  now = new Date(),
) {
  assertCan(actor, "settings.edit");
  return db.transaction(async (tx) => {
    const before = await getPlaybookSettings(tx);
    if (PLAYBOOK_FIELDS.every((k) => before[k] === data[k])) return before;
    const [after] = await tx
      .update(playbookSettings)
      .set({ ...data, updatedAt: now })
      .where(eq(playbookSettings.id, 1))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Playbook Settings",
      recordId: "1",
      recordName: "Playbook Settings",
      action: "Updated",
      before: pick(before, PLAYBOOK_FIELDS),
      after: pick(after, PLAYBOOK_FIELDS),
    });
    return after;
  });
}
