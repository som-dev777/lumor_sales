// Product Facts (F12) and Playbook Settings (F13): one row each, read by everyone, edited by
// Admins. Each save is audited with the fields that changed, in the same transaction.
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { playbookSettings, productFacts, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { PlaybookSettingsData, ProductFactsData } from "@/lib/validation/settings";
import { getPlaybookSettings } from "./leads/quicklog";

export { getPlaybookSettings };

export const FACT_FIELDS = [
  "whatLumorDoes",
  "liveFeatures",
  "featuresNotLive",
  "pricingGuidance",
  "positioningRules",
  "calendarLink",
] as const satisfies readonly (keyof ProductFactsData)[];

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

/** Product Facts with the name of whoever last edited them. */
export async function getProductFacts(db: DbOrTx) {
  const [row] = await db
    .select({ facts: productFacts, editorName: user.name })
    .from(productFacts)
    .leftJoin(user, eq(user.id, productFacts.lastEditedBy))
    .where(eq(productFacts.id, 1));
  if (!row) throw new Error("Product Facts are missing. Run npm run db:migrate.");
  return { ...row.facts, editorName: row.editorName };
}

/** The AI features need at least these two (F12). */
export function factsMissing(f: { whatLumorDoes: string | null; liveFeatures: string | null }) {
  return !f.whatLumorDoes || !f.liveFeatures;
}

export async function saveProductFacts(
  db: Db,
  actor: Actor,
  data: ProductFactsData,
  now = new Date(),
) {
  assertCan(actor, "settings.edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(productFacts).where(eq(productFacts.id, 1));
    const changed = FACT_FIELDS.some((k) => before[k] !== data[k]);
    if (!changed) return before;
    const [after] = await tx
      .update(productFacts)
      .set({ ...data, lastEditedBy: actor.id, lastEditedAt: now, updatedAt: now })
      .where(eq(productFacts.id, 1))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Product Facts",
      recordId: "1",
      recordName: "Product Facts",
      action: "Updated",
      before: pick(before, FACT_FIELDS),
      after: pick(after, FACT_FIELDS),
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
