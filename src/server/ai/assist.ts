// AI help on a lead (F09 Reply Assistant, F10 summary and draft), plus the data changes the
// panel makes: reply type, Mark as sent and Confirm next step. Each change is checked
// (owner or Admin) and audited in the same transaction.
import { and, asc, desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { REPLY_TYPES, type Stage } from "@/lib/db/enums";
import { activity, company, persona, person, template } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { addDaysIst, formatIst, isIstDate, todayIst } from "@/lib/time";
import { placeholdersIn } from "@/lib/validation/library";
import { LeadError } from "../leads/companies";
import { loadPerson } from "../leads/people";
import { quickLog } from "../leads/quicklog";
import { factsMissing, getProductFacts } from "../settings";
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

async function leadContext(db: DbOrTx, personId: string) {
  const [row] = await db
    .select({ p: person, companyName: company.name, persona })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(eq(person.id, personId));
  if (!row) throw new LeadError("That person doesn't exist.");
  const events = await db
    .select()
    .from(activity)
    .where(eq(activity.personId, personId))
    .orderBy(desc(activity.occurredAt))
    .limit(50);
  const facts = await getProductFacts(db);
  if (factsMissing(facts)) {
    throw new AiError(
      "Product Facts aren't filled in yet, so the AI has nothing true to say about Lumor. An Admin can fill them in under Settings → Product Facts.",
    );
  }
  return {
    row,
    PERSON: {
      name: row.p.fullName,
      title: row.p.title,
      company: row.companyName,
      persona: row.persona?.name ?? null,
      personaTier: row.persona?.tier ?? null,
      level: row.p.level,
      market: row.p.market,
      stage: row.p.stage,
    },
    PERSONA_ANGLE: row.persona?.leadWithAngle ?? null,
    TIMELINE: events.reverse().map((e) => ({
      when: formatIst(e.occurredAt),
      type: e.type,
      replyType: e.replyType,
      content: e.content,
    })),
    PRODUCT_FACTS: {
      whatLumorDoes: facts.whatLumorDoes,
      liveFeatures: facts.liveFeatures,
      featuresNotLive: facts.featuresNotLive,
      pricingGuidance: facts.pricingGuidance,
      positioningRules: facts.positioningRules,
      calendarLink: facts.calendarLink,
    },
  };
}

async function loadOwnLead(db: DbOrTx, actor: Actor, personId: string) {
  const p = await loadPerson(db, personId);
  // Same rule as quick-log: the lead's owner or an Admin.
  assertCan(actor, "lead.edit", p);
  return p;
}

// --- P02 Reply Assistant ---------------------------------------------------------------------

const AI_STAGES_AFTER_REPLY = [
  "Replied",
  "Meeting scheduled",
  "Meeting done",
  "Proposal sent",
  "Trial",
] as const;

const nextStepSchema = <S extends readonly [string, ...string[]]>(stages: S) =>
  z.object({ stage: z.enum(stages), nextAction: z.string(), nextActionDate: z.string() });

export const replyResultSchema = z.object({
  replyType: z.enum(REPLY_TYPES),
  suggestions: z.array(z.object({ approach: z.string(), text: z.string() })),
  nextStep: nextStepSchema(AI_STAGES_AFTER_REPLY),
  flags: z.array(z.string()),
});
export type ReplyResult = z.infer<typeof replyResultSchema>;

/** Step 1: the pasted reply is saved straight away, before any AI call (F09). */
export async function savePastedReply(db: Db, actor: Actor, personId: string, text: string) {
  await loadOwnLead(db, actor, personId);
  const { activity: saved } = await quickLog(
    db,
    actor,
    personId,
    { action: "gotReply", replyType: null },
    { note: text },
  );
  return saved;
}

/** Step 2: P02 suggests replies for a saved "Reply received" activity. */
export async function suggestReplies(db: Db, actor: Actor, activityId: string, now = new Date()) {
  const [reply] = await db.select().from(activity).where(eq(activity.id, activityId));
  if (!reply || reply.type !== "Reply received" || !reply.personId) {
    throw new LeadError("That reply doesn't exist.");
  }
  await loadOwnLead(db, actor, reply.personId);
  const ctx = await leadContext(db, reply.personId);
  const replyTemplates = await db
    .select({ name: template.name, purpose: template.purpose, body: template.body })
    .from(template)
    .where(and(eq(template.status, "Active"), like(template.purpose, "Reply%")))
    .orderBy(asc(template.purpose));
  const today = todayIst(now);

  const result = await runPrompt(
    "P02",
    replyResultSchema,
    {
      TODAY: today,
      REPLY: reply.content ?? "",
      PERSON: ctx.PERSON,
      TIMELINE: ctx.TIMELINE,
      "REPLY TEMPLATES": replyTemplates,
      "PRODUCT FACTS": ctx.PRODUCT_FACTS,
    },
    () => fakeReply(ctx.PERSON.name, today),
  );
  return {
    ...result,
    suggestions: result.suggestions.filter((s) => s.text.trim()).slice(0, 3),
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

export type SentMessage = {
  text: string;
  /** The AI's original text, to work out the edit level. */
  suggestion: string;
  approach?: string | null;
  templateId?: string | null;
};

/** Logs a "Message sent" from the AI panel, with approach, template and edit level (F09, F10). */
export async function markSent(db: Db, actor: Actor, personId: string, msg: SentMessage) {
  const text = msg.text.trim();
  if (!text) throw new LeadError("The message is empty.");
  if (placeholdersIn(text).length > 0) {
    throw new LeadError("The message still has {placeholders}. Fill them in first.");
  }
  return db.transaction(async (tx) => {
    const p = await loadOwnLead(tx, actor, personId);
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
        occurredAt: new Date(),
        type: "Message sent",
        channel: "LinkedIn",
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
      },
    });
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
  nextStep: nextStepSchema([
    "Contacted",
    "Connected",
    "Replied",
    "Meeting scheduled",
    "Meeting done",
    "Proposal sent",
    "Trial",
  ] as const),
});
export type SummaryResult = z.infer<typeof summaryResultSchema>;

export async function summariseThread(
  db: Db,
  actor: Actor,
  personId: string,
  thread: string,
  now = new Date(),
) {
  await loadOwnLead(db, actor, personId);
  const ctx = await leadContext(db, personId);
  const today = todayIst(now);
  const result = await runPrompt(
    "P03",
    summaryResultSchema,
    {
      TODAY: today,
      THREAD: thread,
      PERSON: ctx.PERSON,
      TIMELINE: ctx.TIMELINE,
      "PRODUCT FACTS": ctx.PRODUCT_FACTS,
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
  const ctx = await leadContext(db, personId);
  return runPrompt(
    "P04",
    draftResultSchema,
    {
      TEMPLATE: { name: t.name, purpose: t.purpose, version: t.version, body: t.body },
      PERSON: ctx.PERSON,
      "PERSONA ANGLE": ctx.PERSONA_ANGLE,
      TIMELINE: ctx.TIMELINE,
      "PRODUCT FACTS": ctx.PRODUCT_FACTS,
    },
    () => ({
      message: t.body
        .replaceAll(/\{(first ?name|name)\}/gi, ctx.PERSON.name.split(" ")[0])
        .replaceAll(/\{company\}/gi, ctx.PERSON.company ?? "your team")
        .replaceAll(/\{[^}]*\}/g, "your work"),
      notes: [],
    }),
  );
}

// --- The stand-in AI for browser tests -------------------------------------------------------

function fakeReply(name: string, today: string): ReplyResult {
  const first = name.split(" ")[0];
  return {
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
    nextStep: {
      stage: "Replied",
      nextAction: "Book the demo",
      nextActionDate: addDaysIst(today, 1),
    },
    flags: [],
  };
}
