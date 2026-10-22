// Quick-log actions (F15, v2): each button logs an activity and moves the lead's stage and
// next action, in one transaction with its audit entry. From v2, follow-up dates come from
// plans (F17, D-032), not from a fixed sequence.
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  STAGES,
  type CallOutcome,
  type Channel,
  type Direction,
  type LOST_REASONS,
  type REPLY_TYPES,
  type Stage,
} from "@/lib/db/enums";
import { activity, person, playbookSettings, template } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, todayIst } from "@/lib/time";
import { LeadError } from "./companies";
import { loadPerson } from "./people";

export const MESSAGE_CHANNELS = ["LinkedIn", "InMail", "Email", "WhatsApp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export type QuickLog =
  | { action: "requestSent"; withNote?: boolean }
  | { action: "accepted" }
  | { action: "messageSent"; channel?: MessageChannel; templateId?: string | null }
  | { action: "callLogged"; outcome: CallOutcome }
  | { action: "gotReply"; replyType: (typeof REPLY_TYPES)[number] | null; channel?: Channel }
  | { action: "meetingBooked"; meetingDate: string }
  | { action: "meetingHeld" }
  | { action: "proposalSent" }
  | { action: "markConverted" }
  | { action: "markLost"; lostReason: (typeof LOST_REASONS)[number] }
  // From Today's Done buttons (F08).
  | { action: "responded" }
  | { action: "recapSent" }
  | { action: "requestWithdrawn" };

export type QuickLogAction = QuickLog["action"];

/** Actions that are outreach touches, checked by the cadence guardrails (F17). */
export const OUTREACH_ACTIONS: readonly QuickLogAction[] = [
  "requestSent",
  "messageSent",
  "callLogged",
];

export async function getPlaybookSettings(db: DbOrTx) {
  const [row] = await db.select().from(playbookSettings).where(eq(playbookSettings.id, 1));
  if (!row) throw new Error("Playbook settings are missing. Run npm run db:migrate.");
  return row;
}

/** Which side of the conversation an activity is on (F18): messages and calls are the rep's. */
export function directionOf(type: (typeof activity.$inferInsert)["type"]): Direction | null {
  if (type === "Message sent" || type === "InMail sent" || type === "Call") return "out";
  if (type === "Reply received") return "in";
  return null;
}

const rank = (s: Stage) => STAGES.indexOf(s);
const CLOSED: readonly Stage[] = ["Lost", "Paid", "Active customer"];

/** Moves the stage forward only (outreach never moves a lead backwards). */
export function forwardStage(current: Stage, target: Stage): Stage {
  if (CLOSED.includes(current)) return current;
  return rank(target) > rank(current) ? target : current;
}

type Plan = {
  activityType: (typeof activity.$inferInsert)["type"];
  stage: Stage;
  nextAction: string | null;
  nextActionDate: string | null;
  extra?: Partial<typeof activity.$inferInsert>;
  personExtra?: Partial<typeof person.$inferInsert>;
  content?: string;
  toStage?: Stage;
};

/** Runs one quick-log inside an open transaction (plans use this too). */
export async function quickLogTx(
  tx: DbOrTx,
  actor: Actor,
  personId: string,
  log: QuickLog,
  {
    note,
    now = new Date(),
    activityExtra,
  }: {
    note?: string | null;
    now?: Date;
    activityExtra?: Partial<typeof activity.$inferInsert>;
  } = {},
) {
  const before = await loadPerson(tx, personId);
  // Users can't log on a lead someone else owns (PRD).
  assertCan(actor, "lead.edit", before);
  if (before.doNotContact && OUTREACH_ACTIONS.includes(log.action)) {
    throw new LeadError(`${before.fullName} is marked Do not contact. Outreach can't be logged.`);
  }
  const settings = await getPlaybookSettings(tx);
  const today = todayIst(now);
  let plan: Plan;

  switch (log.action) {
    case "requestSent":
      plan = {
        activityType: "Request sent",
        stage: forwardStage(before.stage, "Contacted"),
        nextAction: "Check acceptance",
        nextActionDate: addDaysIst(today, settings.withdrawAfterDays),
        extra: { requestNote: Boolean(log.withNote) },
      };
      break;
    case "accepted":
      plan = {
        activityType: "Request accepted",
        stage: forwardStage(before.stage, "Connected"),
        nextAction: "Send Message 1",
        nextActionDate: addDaysIst(today, settings.msgAfterAcceptMinDays),
      };
      break;
    case "messageSent": {
      const templateId = log.templateId ?? null;
      let version: "A" | "B" | "C" | null = null;
      if (templateId) {
        const [t] = await tx
          .select({ version: template.version })
          .from(template)
          .where(eq(template.id, templateId));
        if (!t) throw new LeadError("That template doesn't exist.");
        version = t.version;
      }
      const channel = log.channel ?? "LinkedIn";
      plan = {
        activityType: channel === "InMail" ? "InMail sent" : "Message sent",
        stage: forwardStage(before.stage, "Contacted"),
        nextAction: null,
        nextActionDate: null,
        extra: { channel, templateId, templateVersion: version },
        personExtra:
          templateId && !before.openerTemplateId
            ? { openerTemplateId: templateId, openerTemplateVersion: version }
            : {},
      };
      break;
    }
    case "callLogged":
      plan = {
        activityType: "Call",
        stage: log.outcome === "Connected" ? forwardStage(before.stage, "Contacted") : before.stage,
        nextAction: before.nextAction,
        nextActionDate: before.nextActionDate,
        extra: { channel: "Call", callOutcome: log.outcome },
        content: log.outcome,
      };
      break;
    case "gotReply":
      plan = {
        activityType: "Reply received",
        stage: forwardStage(before.stage, "Replied"),
        nextAction: "Respond",
        nextActionDate: today,
        extra: { replyType: log.replyType, channel: log.channel ?? "LinkedIn" },
      };
      break;
    case "meetingBooked":
      plan = {
        activityType: "Meeting booked",
        stage: "Meeting scheduled",
        nextAction: "Hold meeting",
        nextActionDate: log.meetingDate,
        content: `Meeting on ${log.meetingDate}`,
      };
      break;
    case "meetingHeld":
      plan = {
        activityType: "Meeting held",
        stage: "Meeting done",
        nextAction: "Send recap",
        nextActionDate: today,
      };
      break;
    case "proposalSent":
      plan = {
        activityType: "Stage change",
        stage: "Proposal sent",
        nextAction: "Follow up on proposal",
        nextActionDate: addDaysIst(today, 3),
        content: `${before.stage} → Proposal sent`,
        toStage: "Proposal sent",
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
    case "markLost":
      plan = {
        activityType: "Stage change",
        stage: "Lost",
        nextAction: null,
        nextActionDate: null,
        content: `${before.stage} → Lost (${log.lostReason})`,
        personExtra: { lostReason: log.lostReason },
        toStage: "Lost",
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
        content: "Post-meeting recap",
      };
      break;
    case "requestWithdrawn":
      plan = {
        activityType: "Request withdrawn",
        stage: before.stage === "Contacted" ? "Prospect" : before.stage,
        nextAction: null,
        nextActionDate: null,
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
      toStage: plan.toStage ?? null,
      direction: directionOf(plan.activityType),
      ...plan.extra,
      ...activityExtra,
    })
    .returning();

  const [after] = await tx
    .update(person)
    .set({
      stage: plan.stage,
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
  return { person: after, activity: logged, before };
}

export async function quickLog(
  db: Db,
  actor: Actor,
  personId: string,
  log: QuickLog,
  opts: { note?: string | null; now?: Date } = {},
) {
  return db.transaction((tx) => quickLogTx(tx, actor, personId, log, opts));
}
