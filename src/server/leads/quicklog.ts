// Quick-log actions and sequence automation (F15): the PRD's table, in code. Each action logs
// an activity and moves the lead's stage, sequence step and next action, in one transaction
// with its audit entry.
import { and, asc, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { REPLY_TYPES, LOST_REASONS, SEQUENCE_STEPS, Stage } from "@/lib/db/enums";
import { activity, person, playbookSettings, template } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, toIstDate, todayIst } from "@/lib/time";
import { LeadError } from "./companies";
import { loadPerson } from "./people";

type SequenceStep = (typeof SEQUENCE_STEPS)[number];

export type QuickLog =
  | { action: "requestSent" }
  | { action: "accepted" }
  | { action: "message1Sent"; templateId?: string | null }
  | { action: "followUpSent" }
  | { action: "gotReply"; replyType: (typeof REPLY_TYPES)[number] | null }
  | { action: "demoBooked"; demoDate: string }
  | { action: "demoHeld" }
  | { action: "markConverted" }
  | { action: "markLost"; lostReason: (typeof LOST_REASONS)[number] }
  // From Today's Done buttons (F08).
  | { action: "responded" }
  | { action: "recapSent" }
  | { action: "requestWithdrawn" };

export type QuickLogAction = QuickLog["action"];

export async function getPlaybookSettings(db: DbOrTx) {
  const [row] = await db.select().from(playbookSettings).where(eq(playbookSettings.id, 1));
  if (!row) throw new Error("Playbook settings are missing. Run npm run db:migrate.");
  return row;
}

/** The date of the lead's first "Message sent" (Message 1), as an IST date. */
async function message1Date(tx: DbOrTx, personId: string): Promise<string | null> {
  const [first] = await tx
    .select({ at: activity.occurredAt })
    .from(activity)
    .where(and(eq(activity.personId, personId), eq(activity.type, "Message sent")))
    .orderBy(asc(activity.occurredAt))
    .limit(1);
  return first ? toIstDate(first.at) : null;
}

/** Which follow-up comes next for a lead, or null if none is due (F15). */
export function nextFollowUp(step: SequenceStep) {
  if (step === "Message 1") return { label: "Follow-up 1 sent", to: "Follow-up 1" as SequenceStep };
  if (step === "Follow-up 1")
    return { label: "Follow-up 2 sent", to: "Follow-up 2" as SequenceStep };
  if (step === "Follow-up 2") return { label: "Break-up sent", to: "Nurture" as SequenceStep };
  return null;
}

type Plan = {
  activityType: (typeof activity.$inferInsert)["type"];
  stage: Stage;
  step?: SequenceStep;
  nextAction: string | null;
  nextActionDate: string | null;
  extra?: Partial<typeof activity.$inferInsert>;
  personExtra?: Partial<typeof person.$inferInsert>;
  content?: string;
};

export async function quickLog(
  db: Db,
  actor: Actor,
  personId: string,
  log: QuickLog,
  { note, now = new Date() }: { note?: string | null; now?: Date } = {},
) {
  return db.transaction(async (tx) => {
    const before = await loadPerson(tx, personId);
    // Users can't log outreach on a lead someone else owns (PRD).
    assertCan(actor, "lead.edit", before);
    const settings = await getPlaybookSettings(tx);
    const today = todayIst(now);
    let plan: Plan;

    switch (log.action) {
      case "requestSent":
        plan = {
          activityType: "Request sent",
          stage: "Request sent",
          step: "Request sent",
          nextAction: "Check acceptance",
          nextActionDate: addDaysIst(today, settings.withdrawAfterDays),
        };
        break;
      case "accepted":
        plan = {
          activityType: "Request accepted",
          stage: "Connected",
          step: "Message 1",
          nextAction: "Send Message 1",
          nextActionDate: today,
        };
        break;
      case "message1Sent": {
        const templateId = log.templateId ?? before.openerTemplateId ?? null;
        let version: "A" | "B" | "C" | null = null;
        if (templateId) {
          const [t] = await tx
            .select({ version: template.version })
            .from(template)
            .where(eq(template.id, templateId));
          if (!t) throw new LeadError("That template doesn't exist.");
          version = t.version;
        }
        // Message 1's date is today (it's the first message, or a re-send counted from today).
        const m1 = (await message1Date(tx, personId)) ?? today;
        plan = {
          activityType: "Message sent",
          stage: "Messaged",
          step: "Message 1",
          nextAction: "Send Follow-up 1",
          nextActionDate: addDaysIst(m1, settings.followUp1DelayDays),
          extra: { templateId, templateVersion: version },
          content: "Message 1",
          personExtra:
            templateId && !before.openerTemplateId
              ? { openerTemplateId: templateId, openerTemplateVersion: version }
              : {},
        };
        break;
      }
      case "followUpSent": {
        const next = nextFollowUp(before.sequenceStep);
        if (!next)
          throw new LeadError(
            "No follow-up is due: send Message 1 first, or this lead is in Nurture or has replied.",
          );
        const m1 = (await message1Date(tx, personId)) ?? today;
        const which =
          next.to === "Follow-up 1"
            ? "Follow-up 1"
            : next.to === "Follow-up 2"
              ? "Follow-up 2"
              : "Break-up";
        plan =
          next.to === "Follow-up 1"
            ? {
                activityType: "Message sent",
                stage: "Messaged",
                step: "Follow-up 1",
                nextAction: "Send Follow-up 2",
                nextActionDate: addDaysIst(m1, settings.followUp2DelayDays),
                content: which,
              }
            : next.to === "Follow-up 2"
              ? {
                  activityType: "Message sent",
                  stage: "Messaged",
                  step: "Follow-up 2",
                  nextAction: "Send Break-up",
                  nextActionDate: addDaysIst(m1, settings.breakUpDelayDays),
                  content: which,
                }
              : {
                  activityType: "Message sent",
                  stage: "Messaged",
                  step: "Nurture",
                  nextAction: "Nurture",
                  nextActionDate: null,
                  content: which,
                };
        break;
      }
      case "gotReply":
        plan = {
          activityType: "Reply received",
          stage: "Replied",
          step: "Stopped (replied)",
          nextAction: "Respond",
          nextActionDate: today,
          extra: { replyType: log.replyType },
        };
        break;
      case "demoBooked":
        plan = {
          activityType: "Demo booked",
          stage: "Demo booked",
          step: "Stopped (replied)",
          nextAction: "Hold demo",
          nextActionDate: log.demoDate,
          content: `Demo on ${log.demoDate}`,
        };
        break;
      case "demoHeld":
        plan = {
          activityType: "Demo held",
          stage: "Demo done",
          nextAction: "Send recap",
          nextActionDate: today,
        };
        break;
      case "markConverted":
        plan = {
          activityType: "Deal update",
          stage: "Paid",
          nextAction: null,
          nextActionDate: null,
          content: "Converted",
          personExtra: { converted: true, convertedDate: today },
        };
        break;
      case "responded":
        plan = {
          activityType: "Message sent",
          stage: before.stage,
          nextAction: null,
          nextActionDate: null,
          content: "Responded",
        };
        break;
      case "recapSent":
        plan = {
          activityType: "Message sent",
          stage: before.stage,
          nextAction: null,
          nextActionDate: null,
          content: "Post-demo recap",
        };
        break;
      case "requestWithdrawn":
        plan = {
          activityType: "Request withdrawn",
          stage: "Prospect",
          step: "Not started",
          nextAction: null,
          nextActionDate: null,
        };
        break;
      case "markLost":
        plan = {
          activityType: "Stage change",
          stage: "Lost",
          step: "Stopped (replied)",
          nextAction: null,
          nextActionDate: null,
          content: `${before.stage} → Lost (${log.lostReason})`,
          personExtra: { lostReason: log.lostReason },
        };
        break;
    }

    const content = [plan.content, note?.trim()].filter(Boolean).join(" — ") || null;
    const [logged] = await tx
      .insert(activity)
      .values({
        personId,
        companyId: before.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: now,
        type: plan.activityType,
        channel: "LinkedIn",
        content,
        ...plan.extra,
      })
      .returning();

    const [after] = await tx
      .update(person)
      .set({
        stage: plan.stage,
        sequenceStep: plan.step ?? before.sequenceStep,
        nextAction: plan.nextAction,
        nextActionDate: plan.nextActionDate,
        lostReason:
          plan.stage === "Lost" ? (plan.personExtra?.lostReason ?? before.lostReason) : null,
        ...plan.personExtra,
      })
      .where(eq(person.id, personId))
      .returning();

    const fields = (r: typeof before) => ({
      stage: r.stage,
      sequenceStep: r.sequenceStep,
      nextAction: r.nextAction,
      nextActionDate: r.nextActionDate,
      lostReason: r.lostReason,
      converted: r.converted,
      convertedDate: r.convertedDate,
      openerTemplateId: r.openerTemplateId,
    });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: personId,
      recordName: after.fullName,
      action: "Updated",
      before: fields(before),
      after: { ...fields(after), loggedActivity: plan.activityType },
    });
    return { person: after, activity: logged };
  });
}
