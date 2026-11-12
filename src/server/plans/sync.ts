// One follow-up per person (D-061): the person's next follow-up date and their active plan's next
// step date are kept the same. A follow-up changed anywhere (My tasks, People, the conversation,
// the person form, the AI summary) moves the plan's date here; the plan writes its own dates onto
// the person in enrolment.ts (mirrorToPerson). No imports from enrolment.ts, so it can be used
// from every follow-up setter.
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { DbOrTx } from "@/lib/db/client";
import { person, planEnrolment } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";

/**
 * The person's follow-up moved to `date`: their active plan's next date moves with it (inside the
 * caller's transaction, audited). Nothing happens without an active plan or when it's the same.
 */
export async function followUpMovesPlan(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  date: string | null,
) {
  if (!date) return;
  const [e] = await tx
    .select()
    .from(planEnrolment)
    .where(and(eq(planEnrolment.personId, personId), inArray(planEnrolment.status, ["Active"])));
  if (!e || e.nextDueDate === date) return;
  await tx.update(planEnrolment).set({ nextDueDate: date }).where(eq(planEnrolment.id, e.id));
  const [p] = await tx
    .select({ fullName: person.fullName })
    .from(person)
    .where(eq(person.id, personId));
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "PlanEnrolment",
    recordId: e.id,
    recordName: p?.fullName ?? personId,
    action: "Updated",
    before: { nextDueDate: e.nextDueDate },
    after: { nextDueDate: date, note: "moved with the person's follow-up" },
  });
}
