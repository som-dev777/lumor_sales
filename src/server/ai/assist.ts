// AI help on a lead (F18 Suggest next message, F10 summary and draft, F18 split conversation),
// plus the data changes the panel makes: reply type, Mark as sent and Confirm next step. Each
// change is checked (owner or Admin) and audited in the same transaction. The AI reads the
// conversation thread (who sent each message, where and when).
import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { REPLY_TYPES, type Stage } from "@/lib/db/enums";
import { activity, company, persona, person, template, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import {
  addDaysIst,
  formatIstDate,
  fromIstLocal,
  isIstDate,
  toIstDate,
  toIstLocal,
  todayIst,
} from "@/lib/time";
import { placeholdersIn } from "@/lib/validation/library";
import { LeadError } from "../leads/companies";
import { loadPerson } from "../leads/people";
import {
  checkReplyBy,
  conversationForAi,
  isDuplicate,
  setAwaiting,
  situationOf,
  threadOf,
  type Situation,
  type SituationKind,
} from "../conversation";
import type { ThreadChannel } from "@/lib/db/enums";
import { getPlaybookSettings } from "../leads/quicklog";
import { planState } from "../plans/enrolment";
import { knowledgeFor } from "../knowledge";
import { getCalendarLink } from "../settings";
import type { AiPromptId } from "@/lib/db/enums";
import { AiError, runPrompt } from "./client";

// --- Edit level (PRD) -----------------------------------------------------------------------

/** Characters that must change to turn a into b (Levenshtein distance). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** None = unchanged; Light = up to 20% of characters changed; Heavy = more. */
export function editLevel(suggestion: string, sent: string): "None" | "Light" | "Heavy" {
  const a = suggestion.trim();
  const b = sent.trim();
  if (a === b) return "None";
  const ratio = editDistance(a, b) / Math.max(a.length, b.length, 1);
  return ratio <= 0.2 ? "Light" : "Heavy";
}

// --- What the AI is told ---------------------------------------------------------------------

async function leadContext(db: DbOrTx, personId: string, prompt: AiPromptId) {
  const [row] = await db
    .select({ p: person, companyName: company.name, persona })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(eq(person.id, personId));
  if (!row) throw new LeadError("That person doesn't exist.");
  const thread = await threadOf(db, personId);
  const plan = await planState(db, personId, todayIst());
  const knowledge = await aiKnowledge(db, prompt);
  return {
    row,
    PERSON: {
      name: row.p.fullName,
      title: row.p.title,
      company: row.companyName,
      persona: row.persona?.name ?? null,
      personaTier: row.persona?.tier ?? null,
      level: row.p.level,
      seniority: row.p.seniority,
      market: row.p.market,
      stage: row.p.stage,
      plan: plan
        ? {
            name: plan.plan.name,
            status: plan.enrolment.status,
            step: `${Math.min(plan.enrolment.currentStep, plan.steps.length)} of ${plan.steps.length}`,
            nextStepChannel: plan.channel,
            nextStepDue: plan.enrolment.nextDueDate,
          }
        : null,
    },
    PERSONA_ANGLE: row.persona?.leadWithAngle ?? null,
    CONVERSATION: conversationForAi(thread, row.p.fullName),
    thread,
    ...knowledge,
  };
}

/**
 * The knowledge base for a prompt (F20), plus the calendar link. It goes first in the AI's
 * input so it can be cached. Refuses when no knowledge file applies.
 */
export async function aiKnowledge(db: DbOrTx, prompt: AiPromptId) {
  const knowledge = await knowledgeFor(db, prompt);
  if (!knowledge) {
    throw new AiError(
      "The AI knowledge base has no files for this yet, so the AI has nothing true to say about Lumor. An Admin can add them under AI Resources.",
    );
  }
  const { calendarLink } = await getCalendarLink(db);
  return {
    KNOWLEDGE_BASE: knowledge,
    CALENDAR_LINK: calendarLink ?? "(not set: ask the rep for a link)",
  };
}

async function loadOwnLead(db: DbOrTx, actor: Actor, personId: string) {
  const p = await loadPerson(db, personId);
  // Same rule as quick-log: the lead's owner or an Admin.
  assertCan(actor, "lead.edit", p);
  return p;
}

// --- P02 Suggest next message (F18) ---------------------------------------------------------

const NEXT_STAGES = [
  "Contacted",
  "Connected",
  "Replied",
  "Meeting scheduled",
  "Meeting done",
  "Proposal sent",
  "Trial",
] as const;

const nextStepSchema = <S extends readonly [string, ...string[]]>(stages: S) =>
  z.object({ stage: z.enum(stages), nextAction: z.string(), nextActionDate: z.string() });

export const nextResultSchema = z.object({
  advice: z.string(),
  replyType: z.enum(REPLY_TYPES).nullable(),
  suggestions: z.array(z.object({ approach: z.string(), text: z.string() })),
  replyBy: z.object({ date: z.string(), reason: z.string() }).nullable(),
  nextStep: nextStepSchema(NEXT_STAGES),
  flags: z.array(z.string()),
});
export type NextResult = z.infer<typeof nextResultSchema>;

/** The PRD's deadline guidance, given to the AI with the Playbook Settings bounds (F18). */
async function deadlineRules(db: DbOrTx, today: string) {
  const s = await getPlaybookSettings(db);
  return {
    allowed: `between ${addDaysIst(today, s.replyDeadlineMinDays)} and ${addDaysIst(today, s.replyDeadlineMaxDays)} (${s.replyDeadlineMinDays}–${s.replyDeadlineMaxDays} days after TODAY)`,
    guidance: [
      "Interested or asked for details: 2 business days",
      "Meeting agreed, time not confirmed: 1–2 business days",
      "Proposal or rates sent: 3 business days, then a call",
      "CXO or Vice President: add 2 days to the above",
      '"Not now": no date (null); the rep uses the date they gave, or Nurture',
      "A nudge: 3–4 business days",
    ],
  };
}

/** Keeps the AI's reply-by date inside the bounds (or drops it when it isn't a date). */
async function boundedReplyBy(db: DbOrTx, r: NextResult["replyBy"], today: string) {
  if (!r || !isIstDate(r.date)) return null;
  const s = await getPlaybookSettings(db);
  const min = addDaysIst(today, s.replyDeadlineMinDays);
  const max = addDaysIst(today, s.replyDeadlineMaxDays);
  return { date: r.date < min ? min : r.date > max ? max : r.date, reason: r.reason.trim() };
}

export type NextSuggestion = Omit<NextResult, "replyBy"> & {
  situation: SituationKind;
  /** A plain sentence about where the conversation stands, from the app. */
  status: string;
  channel: ThreadChannel;
  replyId: string | null;
  replyBy: { date: string; reason: string } | null;
};

/** One line on where the conversation stands, for the panel and Today. */
export function describeSituation(s: Situation, firstName: string): string {
  const last = s.lastAt ? formatIstDate(toIstDate(s.lastAt)) : null;
  switch (s.kind) {
    case "start":
      return "Nothing sent yet.";
    case "reply":
      return `${firstName} replied on ${last}. It's your turn.`;
    case "wait":
      return `You wrote last (${last}). A reply is expected by ${formatIstDate(s.until!)}.`;
    case "nudge":
      return `No reply since ${last}; it was expected by ${formatIstDate(s.until!)}. Nudge ${s.nudges + 1} of 2.`;
    case "close":
      return `No reply after 2 nudges. Time to close the loop politely.`;
  }
}

/** P02 v2.0: reads the whole conversation and suggests the next message for the situation. */
export async function suggestNext(
  db: Db,
  actor: Actor,
  personId: string,
  now = new Date(),
): Promise<NextSuggestion> {
  await loadOwnLead(db, actor, personId);
  const today = todayIst(now);
  const ctx = await leadContext(db, personId, "P02");
  const situation = await situationOf(db, personId, today);
  const replyTemplates = await db
    .select({ name: template.name, purpose: template.purpose, body: template.body })
    .from(template)
    .where(and(eq(template.status, "Active"), like(template.purpose, "Reply%")))
    .orderBy(asc(template.purpose));
  const first = ctx.PERSON.name.split(" ")[0];

  const result = await runPrompt(
    "P02",
    nextResultSchema,
    {
      "KNOWLEDGE BASE": ctx.KNOWLEDGE_BASE,
      "CALENDAR LINK": ctx.CALENDAR_LINK,
      TODAY: today,
      SITUATION: {
        kind: situation.kind,
        lastMessageFrom: situation.lastFrom,
        lastChannel: situation.lastChannel,
        replyExpectedBy: situation.until,
        nudgesSent: situation.nudges,
      },
      CONVERSATION: ctx.CONVERSATION,
      PERSON: ctx.PERSON,
      "PERSONA ANGLE": ctx.PERSONA_ANGLE,
      "REPLY TEMPLATES": replyTemplates,
      "DEADLINE RULES": await deadlineRules(db, today),
    },
    () => fakeNext(situation, first, today),
  );

  // The AI's reply type is saved on their message when it had none (D-038).
  if (situation.kind === "reply" && situation.replyId && result.replyType) {
    const reply = ctx.thread.find((i) => i.id === situation.replyId);
    if (reply && !reply.replyType) {
      await setReplyType(db, actor, situation.replyId, result.replyType);
    }
  }
  const max = situation.kind === "wait" ? 1 : situation.kind === "close" ? 1 : 3;
  return {
    ...result,
    situation: situation.kind,
    status: describeSituation(situation, first),
    channel:
      situation.lastChannel === "In person" ? "LinkedIn" : (situation.lastChannel ?? "LinkedIn"),
    replyId: situation.replyId,
    replyType: situation.kind === "reply" ? result.replyType : null,
    suggestions: result.suggestions.filter((s) => s.text.trim()).slice(0, max),
    replyBy: situation.kind === "close" ? null : await boundedReplyBy(db, result.replyBy, today),
    nextStep: {
      ...result.nextStep,
      nextActionDate: safeDate(result.nextStep.nextActionDate, today),
    },
  };
}

const safeDate = (d: string, today: string) => (isIstDate(d) && d >= today ? d : today);

/** The rep changes the reply type the AI chose (drives the Dashboard's Interested count). */
export async function setReplyType(
  db: Db,
  actor: Actor,
  activityId: string,
  replyType: (typeof REPLY_TYPES)[number],
) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(activity).where(eq(activity.id, activityId));
    if (!before || before.type !== "Reply received" || !before.personId) {
      throw new LeadError("That reply doesn't exist.");
    }
    const p = await loadOwnLead(tx, actor, before.personId);
    const [after] = await tx
      .update(activity)
      .set({ replyType })
      .where(eq(activity.id, activityId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: activityId,
      recordName: `Reply from ${p.fullName}`,
      action: "Updated",
      before: { replyType: before.replyType },
      after: { replyType: after.replyType },
    });
    return after;
  });
}

// --- Mark as sent and Confirm ---------------------------------------------------------------

export const SEND_CHANNELS = ["LinkedIn", "InMail", "Email", "WhatsApp"] as const;

export type SentMessage = {
  text: string;
  /** The AI's original text, to work out the edit level. */
  suggestion: string;
  approach?: string | null;
  templateId?: string | null;
  channel?: (typeof SEND_CHANNELS)[number];
  /** The reply-by date the rep confirmed (F18; the AI never sets it alone). */
  replyBy?: string | null;
  /** The situation the suggestion was for: a nudge counts, a reply resets, close clears. */
  situation?: SituationKind | null;
};

/** Logs a "Message sent" from the AI panel, with approach, template and edit level (F09, F10). */
export async function markSent(
  db: Db,
  actor: Actor,
  personId: string,
  msg: SentMessage,
  now = new Date(),
) {
  const text = msg.text.trim();
  if (!text) throw new LeadError("The message is empty.");
  if (placeholdersIn(text).length > 0) {
    throw new LeadError(`Fill in {${placeholdersIn(text)[0]}} first.`);
  }
  if (msg.situation === "nudge" && !msg.replyBy) {
    throw new LeadError("Pick the date you expect a reply by.");
  }
  return db.transaction(async (tx) => {
    const p = await loadOwnLead(tx, actor, personId);
    if (p.doNotContact) {
      throw new LeadError(`${p.fullName} is marked Do not contact. Outreach can't be logged.`);
    }
    const today = todayIst(now);
    if (msg.replyBy && msg.situation !== "close") await checkReplyBy(tx, msg.replyBy, today);
    const channel = msg.channel ?? "LinkedIn";
    let version: "A" | "B" | "C" | null = null;
    if (msg.templateId) {
      const [t] = await tx.select().from(template).where(eq(template.id, msg.templateId));
      if (!t) throw new LeadError("That template doesn't exist.");
      version = t.version;
    }
    const level = editLevel(msg.suggestion, text);
    const [row] = await tx
      .insert(activity)
      .values({
        personId,
        companyId: p.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: now,
        type: channel === "InMail" ? "InMail sent" : "Message sent",
        channel,
        direction: "out",
        content: text,
        templateId: msg.templateId ?? null,
        templateVersion: version,
        aiSuggestionUsed: true,
        suggestionApproach: msg.approach?.trim().slice(0, 100) || null,
        editLevel: level,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Activity",
      recordId: row.id,
      recordName: `Message to ${p.fullName}`,
      action: "Created",
      after: {
        type: row.type,
        person: p.fullName,
        aiSuggestionUsed: true,
        suggestionApproach: row.suggestionApproach,
        editLevel: level,
        templateId: row.templateId,
        channel,
      },
    });
    if (msg.situation === "close") {
      await setAwaiting(tx, actor, personId, { awaitingReplyUntil: null });
    } else if (msg.replyBy || msg.situation === "nudge" || msg.situation === "reply") {
      await setAwaiting(tx, actor, personId, {
        ...(msg.replyBy ? { awaitingReplyUntil: msg.replyBy } : {}),
        nudgeCount:
          msg.situation === "nudge" ? p.nudgeCount + 1 : msg.situation === "reply" ? 0 : undefined,
      });
    }
    return row;
  });
}

const CONFIRMABLE_STAGES: readonly Stage[] = [
  "Contacted",
  "Connected",
  "Replied",
  "Meeting scheduled",
  "Meeting done",
  "Proposal sent",
  "Trial",
];

/** Confirm the AI's suggested stage and next action (never Lost or Paid). */
export async function applyNextStep(
  db: Db,
  actor: Actor,
  personId: string,
  step: { stage: string; nextAction: string; nextActionDate: string },
) {
  if (!CONFIRMABLE_STAGES.includes(step.stage as Stage)) {
    throw new LeadError("That stage can't be set from a suggestion.");
  }
  if (!isIstDate(step.nextActionDate)) throw new LeadError("Pick a valid date.");
  const nextAction = step.nextAction.trim().slice(0, 200) || null;
  return db.transaction(async (tx) => {
    const before = await loadOwnLead(tx, actor, personId);
    const stage = step.stage as Stage;
    const [after] = await tx
      .update(person)
      .set({ stage, nextAction, nextActionDate: step.nextActionDate, lostReason: null })
      .where(eq(person.id, personId))
      .returning();
    if (before.stage !== stage) {
      await tx.insert(activity).values({
        personId,
        companyId: before.companyId,
        userId: actor.id,
        createdBy: actor.id,
        occurredAt: new Date(),
        type: "Stage change",
        channel: "LinkedIn",
        content: `${before.stage} → ${stage}`,
      });
    }
    const fields = (r: typeof before) => ({
      stage: r.stage,
      nextAction: r.nextAction,
      nextActionDate: r.nextActionDate,
    });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: personId,
      recordName: after.fullName,
      action: "Updated",
      before: fields(before),
      after: { ...fields(after), source: "AI suggestion" },
    });
    return after;
  });
}

// --- P03 Summarise conversation --------------------------------------------------------------

export const summaryResultSchema = z.object({
  summary: z.string(),
  needs: z.array(z.string()),
  objections: z.array(z.string()),
  nextStep: nextStepSchema(NEXT_STAGES),
});
export type SummaryResult = z.infer<typeof summaryResultSchema>;

export async function summariseThread(db: Db, actor: Actor, personId: string, now = new Date()) {
  await loadOwnLead(db, actor, personId);
  const ctx = await leadContext(db, personId, "P03");
  if (ctx.CONVERSATION.length === 0) {
    throw new LeadError("There's nothing in the conversation yet. Add the messages first.");
  }
  const today = todayIst(now);
  const result = await runPrompt(
    "P03",
    summaryResultSchema,
    {
      "KNOWLEDGE BASE": ctx.KNOWLEDGE_BASE,
      TODAY: today,
      CONVERSATION: ctx.CONVERSATION,
      PERSON: ctx.PERSON,
    },
    () => ({
      summary: `${ctx.PERSON.name} is interested and wants to see how it works on their data.`,
      needs: ["Faster analysis of open-ended survey answers"],
      objections: ["Worried about setup time"],
      nextStep: { stage: "Replied", nextAction: "Send demo slots", nextActionDate: today },
    }),
  );
  return {
    ...result,
    nextStep: {
      ...result.nextStep,
      nextActionDate: safeDate(result.nextStep.nextActionDate, today),
    },
  };
}

// --- P04 Draft message -----------------------------------------------------------------------

export const draftResultSchema = z.object({ message: z.string(), notes: z.array(z.string()) });

export async function draftFromTemplate(
  db: Db,
  actor: Actor,
  personId: string,
  templateId: string,
) {
  await loadOwnLead(db, actor, personId);
  const [t] = await db.select().from(template).where(eq(template.id, templateId));
  if (!t || t.status !== "Active") throw new LeadError("Choose an active template.");
  const ctx = await leadContext(db, personId, "P04");
  return runPrompt(
    "P04",
    draftResultSchema,
    {
      "KNOWLEDGE BASE": ctx.KNOWLEDGE_BASE,
      "CALENDAR LINK": ctx.CALENDAR_LINK,
      TEMPLATE: { name: t.name, purpose: t.purpose, version: t.version, body: t.body },
      PERSON: ctx.PERSON,
      "PERSONA ANGLE": ctx.PERSONA_ANGLE,
      CONVERSATION: ctx.CONVERSATION,
    },
    () => {
      // Stand-in AI: fills what it knows and leaves the rest visible, as the guardrails say.
      const message = t.body
        .replaceAll(/\{(first ?name|name)\}/gi, ctx.PERSON.name.split(" ")[0])
        .replaceAll(/\{company\}/gi, ctx.PERSON.company ?? "{Company}");
      const left = [...message.matchAll(/\{([^{}\n]{1,40})\}/g)].map((m) => `Fill in {${m[1]}}.`);
      return { message, notes: left };
    },
  );
}

// --- The stand-in AI for browser tests -------------------------------------------------------

function fakeNext(s: Situation, first: string, today: string): NextResult {
  const replyBy = { date: addDaysIst(today, 2), reason: "Interested: 2 business days." };
  const nextStep = {
    stage: "Replied" as const,
    nextAction: "Book the demo",
    nextActionDate: addDaysIst(today, 1),
  };
  switch (s.kind) {
    case "reply":
      return {
        advice: `${first} is interested. Offer two demo slots.`,
        replyType: "Interested",
        suggestions: [
          {
            approach: "Book the demo",
            text: `Thanks ${first}! Would a 20-minute demo on Tuesday at 11am or Wednesday at 4pm IST work?`,
          },
          {
            approach: "Answer first, then ask",
            text: `Happy to share more, ${first}. Shall I walk you through it in a 20-minute call this week?`,
          },
        ],
        replyBy,
        nextStep,
        flags: [],
      };
    case "wait":
      return {
        advice: `Wait for ${first} to reply.`,
        replyType: null,
        suggestions: [],
        replyBy: null,
        nextStep: { ...nextStep, stage: "Contacted", nextAction: "Wait for a reply" },
        flags: [],
      };
    case "close":
      return {
        advice: "Close the loop politely.",
        replyType: null,
        suggestions: [
          {
            approach: "Close the loop",
            text: `Hi ${first}, I'll leave it here for now. If research tooling comes up later, I'm happy to help.`,
          },
        ],
        replyBy: null,
        nextStep: { ...nextStep, stage: "Contacted", nextAction: "Nurture" },
        flags: [],
      };
    default:
      return {
        advice: s.kind === "nudge" ? "Nudge with something new." : "Start the conversation.",
        replyType: null,
        suggestions: [
          {
            approach: s.kind === "nudge" ? "Share an example" : "Opener",
            text: `Hi ${first}, here's a 2-minute example of a survey built and analysed end to end in Lumor. Worth a look?`,
          },
        ],
        replyBy: { date: addDaysIst(today, 3), reason: "A nudge: 3 business days." },
        nextStep: { ...nextStep, stage: "Contacted", nextAction: "Wait for a reply" },
        flags: [],
      };
  }
}

// --- P05 Split conversation (F18) ------------------------------------------------------------

export const splitResultSchema = z.object({
  messages: z.array(
    z.object({ from: z.enum(["me", "them"]), sentAt: z.string().nullable(), text: z.string() }),
  ),
  notes: z.array(z.string()),
});

export type SplitRow = {
  from: "me" | "them";
  /** "YYYY-MM-DDTHH:mm" in IST, or empty when the AI couldn't read a time. */
  at: string;
  text: string;
  duplicate: boolean;
};

/**
 * P05: splits a pasted conversation into messages for the rep to review (F18). Nothing is saved
 * here; times that can't be read or are in the future come back empty.
 */
export async function splitConversation(
  db: Db,
  actor: Actor,
  personId: string,
  pasted: string,
  now = new Date(),
): Promise<{ rows: SplitRow[]; notes: string[] }> {
  const p = await loadOwnLead(db, actor, personId);
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, p.ownerId));
  const result = await runPrompt(
    "P05",
    splitResultSchema,
    {
      TODAY: todayIst(now),
      "TIME ZONE": "India time (IST, UTC+05:30)",
      REP: owner?.name ?? "the rep",
      PROSPECT: p.fullName,
      PASTED: pasted,
    },
    () => fakeSplit(pasted),
  );
  const thread = await threadOf(db, personId);
  const rows = result.messages
    .filter((m) => m.text.trim())
    .slice(0, 100)
    .map((m) => {
      const at = m.sentAt ? fromIstLocal(m.sentAt) : null;
      return {
        from: m.from,
        at: at && at.getTime() <= now.getTime() + 60_000 ? toIstLocal(at) : "",
        text: m.text.trim(),
        duplicate: isDuplicate(thread, m.from, m.text),
      };
    });
  return { rows, notes: result.notes };
}

/** Stand-in for the browser tests: "[YYYY-MM-DD HH:mm] Me: text" or "... Them: text" per line. */
function fakeSplit(pasted: string) {
  const messages = pasted
    .split("\n")
    .map((line) => line.match(/^(?:\[([^\]]+)\]\s*)?(me|them)\s*:\s*(.+)$/i))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({
      from: m[2].toLowerCase() as "me" | "them",
      sentAt: m[1] ?? null,
      text: m[3],
    }));
  return { messages, notes: [] };
}
