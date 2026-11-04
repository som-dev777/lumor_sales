// Outreach Desk (D-056; docs/specs/outreach-desk.md sections 4–9): AI drafts on a person's
// thread, and the changes the Desk makes. Messages, replies and notes are logged as the same
// activities as before (Reply received, Message sent, InMail sent, Call, Request sent, Meeting
// note); instructions and drafts go in desk_entry. Every change checks the permission and is
// audited in the same transaction.
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  DESK_TO_CHANNEL,
  REPLY_TYPES,
  TEMPLATE_PURPOSES,
  type DeskChannel,
  type DeskTask,
} from "@/lib/db/enums";
import {
  activity,
  aiChat,
  aiChatMessage,
  company,
  deskEntry,
  knowledgeFile,
  person,
  persona,
  template,
  user,
  type DeskOption,
} from "@/lib/db/schema";
import { type Actor } from "@/lib/permissions";
import { placeholdersIn } from "@/lib/validation/library";
import { addEntryTx, situationOf } from "../conversation";
import { LeadError } from "../leads/companies";
import { logWithPlanTx } from "../plans/enrolment";
import { todayIst } from "@/lib/time";
import { aiKnowledge, editLevel, loadOwnLead, markSent, setReplyType } from "./assist";
import { runPromptWith, writingModel } from "./client";
import { deskThread, transcript, type DeskItem } from "./desk-thread";
import { WRITING_RULES } from "./prompts";

type ReplyType = (typeof REPLY_TYPES)[number];

export const DESK_TEXT_MAX = 5000;
export const BRIEF_MAX = 5000;
/** About 700 tokens of text; the hard limit is higher because reasoning counts toward it. */
export const DESK_MAX_OUTPUT_TOKENS = 2000;
const MAX_OPTIONS = 3;

// --- Prompt pieces (spec sections 5, 6 and 8) ---------------------------------------------------

/** The spec's task text (section 8). */
export function taskText(task: DeskTask, channel: DeskChannel, instruction?: string | null) {
  switch (task) {
    case "first":
      return `Draft the FIRST outreach message to this person on: ${channel}. If the channel is a LinkedIn message, assume they've just accepted the connection request.`;
    case "reply":
      return `They just replied (the last entry). Classify their reply at the start of the tip (Interested, Asking for details, Not now, Objection, Using a competitor, Not interested) and draft the response on: ${channel}. Move toward a 20-minute demo unless they said no.`;
    case "next":
      return `Draft the next message to send on: ${channel}, based on where the conversation stands. If the last message got no reply, the follow-up must add something new.`;
    case "ask":
      return `Follow the rep's latest instruction ("${instruction ?? ""}") and draft on: ${channel}.`;
  }
}

/** The writing rules with the rep's name and title filled in (no title: left out). */
export function writingRulesFor(repName: string, repTitle: string | null | undefined) {
  const title = repTitle?.trim();
  return title
    ? WRITING_RULES.replaceAll("{rep name}", repName).replaceAll("{rep title}", title)
    : WRITING_RULES.replaceAll("{rep name}, {rep title}", repName).replaceAll(
        "{rep name}",
        repName,
      );
}

/** Which template purposes suit this draft (the owner's style references). */
export function purposesFor(
  task: DeskTask,
  channel: DeskChannel,
  items: DeskItem[],
  replyType: ReplyType | null,
): (typeof TEMPLATE_PURPOSES)[number][] {
  if (channel === "LinkedIn connection note" || channel === "Call") return [];
  if (task === "reply") {
    const byType: Partial<Record<ReplyType, (typeof TEMPLATE_PURPOSES)[number]>> = {
      Interested: "Reply – interested",
      "Asking for details": "Reply – details",
      "Not now": "Reply – not now",
      "Using a competitor": "Reply – competitor",
    };
    if (replyType) return byType[replyType] ? [byType[replyType]!] : [];
    return ["Reply – interested", "Reply – details", "Reply – not now", "Reply – competitor"];
  }
  const sent = items.filter(
    (i) => i.kind === "sent" && !i.called && !i.channel.startsWith("LinkedIn connection"),
  ).length;
  const step =
    task === "first" || sent === 0
      ? "Message 1"
      : sent === 1
        ? "Follow-up 1"
        : sent === 2
          ? "Follow-up 2"
          : "Break-up";
  return channel === "LinkedIn InMail" && step === "Message 1" ? ["InMail", "Message 1"] : [step];
}

/** Up to 3 Official, Active templates for the purposes, the person's persona first. */
export async function styleReferences(
  db: DbOrTx,
  personaId: string | null,
  purposes: readonly (typeof TEMPLATE_PURPOSES)[number][],
) {
  if (purposes.length === 0) return [];
  const rows = await db
    .select({
      id: template.id,
      name: template.name,
      purpose: template.purpose,
      personaId: template.personaId,
      version: template.version,
      body: template.body,
    })
    .from(template)
    .where(
      and(
        eq(template.type, "Official"),
        eq(template.status, "Active"),
        inArray(template.purpose, [...purposes]),
        personaId
          ? or(eq(template.personaId, personaId), isNull(template.personaId))
          : isNull(template.personaId),
      ),
    )
    .orderBy(asc(template.name));
  return rows
    .sort(
      (a, b) =>
        purposes.indexOf(a.purpose) - purposes.indexOf(b.purpose) ||
        Number(b.personaId === personaId) - Number(a.personaId === personaId) ||
        a.version.localeCompare(b.version),
    )
    .slice(0, 3);
}

// --- Output checker (spec section 5) ------------------------------------------------------------

const BANNED = [
  "proprietary",
  "just following up",
  "bumping",
  "circling back",
  "no lock-in",
  "unlimited teammates",
];
const SPEED_CLAIM = /\b\d+(?:\.\d+)?\s*(?:x|×|times)\s+(?:faster|quicker|cheaper|better|more)\b/i;
const SAVINGS_CLAIM =
  /\b\d+(?:\.\d+)?\s*%\s*(?:cheaper|less|lower|savings?|faster|off|reduction|more efficient)\b/i;

/** Upcoming feature names, from the table in the 07-upcoming-features knowledge file. */
export function upcomingFeatureNames(markdown: string): string[] {
  const names: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (!m || /^-+$/.test(m[1]) || /^feature$/i.test(m[1])) continue;
    names.push(m[1].replace(/\s*\(.*\)\s*$/, "").trim());
  }
  return names.filter(Boolean);
}

/** What's wrong with a draft, in plain words; empty when it's fine. */
export function checkDraft(options: DeskOption[], features: string[]): string[] {
  const problems = new Set<string>();
  for (const o of options) {
    const text = `${o.subject}\n${o.text}`.toLowerCase();
    for (const b of BANNED) if (text.includes(b)) problems.add(`says "${b}"`);
    if (SPEED_CLAIM.test(text) || SAVINGS_CLAIM.test(text)) {
      problems.add("makes a speed or savings claim");
    }
    for (const f of features) {
      if (f && text.includes(f.toLowerCase())) problems.add(`names an upcoming feature (${f})`);
    }
  }
  return [...problems];
}

async function upcomingFeatures(db: DbOrTx) {
  const [file] = await db
    .select({ content: knowledgeFile.content })
    .from(knowledgeFile)
    .where(and(eq(knowledgeFile.slug, "07-upcoming-features"), eq(knowledgeFile.active, true)));
  return file ? upcomingFeatureNames(file.content) : [];
}

/** The reply type at the start of the tip ("Interested. …"), if any. */
export function replyTypeOf(tip: string): ReplyType | null {
  const start = tip.trim().toLowerCase();
  return (
    [...REPLY_TYPES]
      .sort((a, b) => b.length - a.length)
      .find((t) => start.startsWith(t.toLowerCase())) ?? null
  );
}

// --- Drafting -----------------------------------------------------------------------------------

export const deskResultSchema = z.object({
  options: z.array(z.object({ label: z.string(), subject: z.string(), text: z.string() })),
  tip: z.string(),
});
type DeskResult = z.infer<typeof deskResultSchema>;

const withSubject = (c: DeskChannel) => c === "Email" || c === "LinkedIn InMail";

/** The AI input, in the spec's order, so the repeated part can be cached. */
export async function deskInput(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  task: DeskTask,
  channel: DeskChannel,
  instruction: string | null,
  items: DeskItem[],
  replyType: ReplyType | null,
) {
  const [row] = await db
    .select({ p: person, companyName: company.name, personaName: persona.name })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .leftJoin(persona, eq(persona.id, person.personaId))
    .where(eq(person.id, personId));
  if (!row) throw new LeadError("That person doesn't exist.");
  const [rep] = await db
    .select({ name: user.name, jobTitle: user.jobTitle })
    .from(user)
    .where(eq(user.id, actor.id));
  const knowledge = await aiKnowledge(db, "P02", actor.id);
  const refs = await styleReferences(
    db,
    row.p.personaId,
    purposesFor(task, channel, items, replyType),
  );
  const link = knowledge.CALENDAR_LINK.startsWith("(not set")
    ? "{calendar link}"
    : knowledge.CALENDAR_LINK;
  const input = {
    "KNOWLEDGE BASE": knowledge.KNOWLEDGE_BASE,
    "WRITING RULES": writingRulesFor(rep?.name ?? "the rep", rep?.jobTitle),
    "DEMO BOOKING LINK": link,
    "STYLE REFERENCES": refs.length
      ? refs.map((t) => ({ name: t.name, purpose: t.purpose, text: t.body }))
      : "(none for this message)",
    PERSON: {
      name: row.p.fullName,
      company: row.companyName,
      role: row.p.title,
      persona: row.personaName,
      whoTheyAre: row.p.brief ?? null,
    },
    "CONVERSATION SO FAR": transcript(items, row.p.fullName) || "(nothing yet)",
    TASK: taskText(task, channel, instruction),
  };
  return { input, refs, personName: row.p.fullName, repName: rep?.name ?? "the rep" };
}

/** The browser tests' stand-in for the AI: channel-shaped options. */
export function fakeDesk(
  task: DeskTask,
  channel: DeskChannel,
  first: string,
  instruction: string | null,
): DeskResult {
  const subject = withSubject(channel) ? `A question about your research, ${first}` : "";
  const short = /short/i.test(instruction ?? "");
  if (channel === "Call") {
    return {
      options: [
        {
          label: "Discovery call",
          subject: "",
          text: `Opening: Hi ${first}, it's about how your team runs surveys.\nQuestions:\n- How do you recruit respondents today?\n- What slows your studies down?\nObjection: "We have a tool." Response: happy to show how it fits alongside.\nClose: Would a 20-minute demo on {slot 1} or {slot 2} work?`,
        },
        {
          label: "Straight to the demo",
          subject: "",
          text: `Opening: Hi ${first}, quick call about your research work.\nQuestions:\n- Who runs your surveys?\n- How do you find participants?\nObjection: "No time now." Response: 20 minutes, whenever suits.\nClose: Shall I send a booking link?`,
        },
      ],
      tip: "Two talk tracks: one discovery-led, one direct. Fill in the slots before the call.",
    };
  }
  const options =
    task === "reply"
      ? [
          {
            label: "Book the demo",
            subject,
            text: `Thanks ${first}, glad it sounds useful. Would 20 minutes on {slot 1} or {slot 2} work?`,
          },
          {
            label: "Share the link",
            subject,
            text: `Thanks ${first}! Pick any time that suits here: https://lumor.tech/demo`,
          },
        ]
      : [
          {
            label: short ? "Shorter" : "Question first",
            subject,
            text: short
              ? `Hi ${first}, how do you recruit for surveys today?`
              : `Hi ${first}, I'm with Lumor, a survey and research platform. How does your team find participants for studies today?`,
          },
          {
            label: "Demo slots",
            subject,
            text: `Hi ${first}, would a 20-minute demo on {slot 1} or {slot 2} be useful?`,
          },
        ];
  return {
    options,
    tip:
      task === "reply"
        ? "Interested. They asked how it works, so offer a short demo."
        : "One opens with a question, one offers a demo. Fill in the slots first.",
  };
}

type DraftInput = { task: DeskTask; channel: DeskChannel; instruction?: string | null };

/**
 * Drafts 2–3 options and saves them on the thread (with the instruction first, for Ask AI).
 * Owner or Admin only. For a reply, the AI's reply type is saved on their message when it has
 * none. The output checker retries once, then saves with a warning.
 */
export async function draftOnDesk(db: Db, actor: Actor, personId: string, input: DraftInput) {
  const lead = await loadOwnLead(db, actor, personId);
  const instruction = input.instruction?.trim().slice(0, DESK_TEXT_MAX) || null;
  const task: DeskTask = input.task === "ask" && !instruction ? "next" : input.task;
  if (instruction && task === "ask") {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(deskEntry)
        .values({
          personId,
          userId: actor.id,
          createdBy: actor.id,
          kind: "ask",
          channel: input.channel,
          content: instruction,
        })
        .returning();
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "AI instruction",
        recordId: row.id,
        recordName: `AI instruction on ${lead.fullName}`,
        action: "Created",
        after: { person: personId, channel: row.channel },
      });
    });
  }
  const items = await deskThread(db, actor, personId);
  const reply = task === "reply" ? [...items].reverse().find((i) => i.kind === "them") : undefined;
  const knownType =
    reply?.kind === "them" && reply.replyType ? (reply.replyType as ReplyType) : null;
  const {
    input: aiInput,
    refs,
    personName,
  } = await deskInput(db, actor, personId, task, input.channel, instruction, items, knownType);
  const first = personName.split(/\s+/)[0];
  const features = await upcomingFeatures(db);
  const ask = (extra?: string) =>
    runPromptWith(
      "P11",
      deskResultSchema,
      extra ? { ...aiInput, TASK: `${aiInput.TASK}\n${extra}` } : aiInput,
      () => fakeDesk(task, input.channel, first, instruction),
      { model: writingModel(), maxOutputTokens: DESK_MAX_OUTPUT_TOKENS },
    );
  const tidy = (r: DeskResult): DeskOption[] =>
    r.options
      .map((o) => ({
        label: o.label.trim().slice(0, 60) || "Option",
        subject: withSubject(input.channel) ? o.subject.trim().slice(0, 200) : "",
        text: o.text.trim(),
      }))
      .filter((o) => o.text)
      .slice(0, MAX_OPTIONS);
  let result = await ask();
  let options = tidy(result);
  let problems = checkDraft(options, features);
  if (problems.length) {
    result = await ask(
      `Your last draft was rejected because it ${problems.join(", ")}. Write new options without that.`,
    );
    options = tidy(result);
    problems = checkDraft(options, features);
  }
  if (options.length === 0)
    throw new LeadError("The AI couldn't draft that. Try again, or add more context.");
  const tip = result.tip.trim().slice(0, 600);
  const replyType = task === "reply" ? replyTypeOf(tip) : null;
  if (reply?.kind === "them" && replyType && !reply.replyType) {
    await setReplyType(db, actor, reply.id, replyType);
  }
  // The template to credit on Mark as sent: the one matching the reply type, else the first.
  const credited =
    task === "reply" && replyType
      ? refs.find((t) => t.purpose === purposesFor("reply", input.channel, [], replyType)[0])
      : refs[0];
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(deskEntry)
      .values({
        personId,
        userId: actor.id,
        createdBy: actor.id,
        kind: "draft",
        channel: input.channel,
        task,
        options,
        tip,
        warning: problems.length
          ? `Check before sending: this draft ${problems.join(", ")}.`
          : null,
        templateId: credited?.id ?? null,
        replyActivityId: reply?.id ?? null,
      })
      .returning();
    // The text stays out of the audit log, as with AI chats.
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "AI draft",
      recordId: row.id,
      recordName: `AI draft for ${lead.fullName}`,
      action: "Created",
      after: {
        person: personId,
        channel: row.channel,
        task,
        options: options.length,
        templateId: row.templateId,
        ...(row.warning ? { warning: true } : {}),
      },
    });
    return row;
  });
}

// --- Their reply and Info about them ------------------------------------------------------------

/** Their reply: a Reply received (pauses the plan), on the desk channel. */
export async function addDeskReply(
  db: Db,
  actor: Actor,
  personId: string,
  channel: DeskChannel,
  text: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const row = await addEntryTx(
      tx,
      actor,
      personId,
      { from: "them", channel: DESK_TO_CHANNEL[channel], at: now, text },
      { now },
    );
    if (row) await setDeskFields(tx, actor, row.id, { deskChannel: channel });
    return row;
  });
}

/** Info about them: a note in the conversation (no draft). */
export async function addDeskInfo(
  db: Db,
  actor: Actor,
  personId: string,
  channel: DeskChannel,
  text: string,
  now = new Date(),
) {
  return db.transaction((tx) =>
    addEntryTx(
      tx,
      actor,
      personId,
      { from: "note", channel: DESK_TO_CHANNEL[channel], at: now, text },
      { now },
    ),
  );
}

/** Saves the Desk's own fields on an activity just created in this transaction. Audited. */
async function setDeskFields(
  tx: DbOrTx,
  actor: Actor,
  activityId: string,
  fields: Partial<typeof activity.$inferInsert>,
) {
  const [after] = await tx
    .update(activity)
    .set(fields)
    .where(eq(activity.id, activityId))
    .returning();
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Activity",
    recordId: activityId,
    recordName: `${after.type} (Outreach Desk)`,
    action: "Updated",
    after: {
      deskChannel: after.deskChannel,
      ...(fields.fromDraftId !== undefined
        ? { fromDraftId: after.fromDraftId, optionIndex: after.optionIndex }
        : {}),
      ...(fields.aiSuggestionUsed ? { aiSuggestionUsed: true, editLevel: after.editLevel } : {}),
      ...(fields.templateId ? { templateId: after.templateId } : {}),
    },
  });
  return after;
}

// --- Mark as sent / Mark as called --------------------------------------------------------------

export type MarkInput = {
  source: "desk" | "chat";
  draftId: string;
  optionIndex: number;
  /** The text as edited by the rep. */
  text: string;
  subject?: string | null;
  /** For drafts from an old chat (no channel saved): the composer's channel. */
  channel?: DeskChannel;
  override?: boolean;
  /** Messages: the date a reply is expected by (F18 reply deadlines and nudges). */
  replyBy?: string | null;
};

/**
 * Mark as sent (Mark as called): logs the option as the same activity as before. Blocked while a
 * `{placeholder}` is left (spec section 9).
 */
export async function markDeskSent(
  db: Db,
  actor: Actor,
  personId: string,
  m: MarkInput,
  now = new Date(),
) {
  const text = m.text.trim();
  const subject = m.subject?.trim() || null;
  if (!text) throw new LeadError("The message is empty.");
  if (text.length > DESK_TEXT_MAX) throw new LeadError("That message is too long.");
  const left = [...placeholdersIn(text), ...placeholdersIn(subject ?? "")];
  if (left.length) throw new LeadError(`Fill in {${left[0]}} first.`);
  await loadOwnLead(db, actor, personId);

  let option: DeskOption | undefined;
  let channel: DeskChannel;
  let templateId: string | null = null;
  let fromDraftId: string | null = null;
  if (m.source === "desk") {
    const [d] = await db.select().from(deskEntry).where(eq(deskEntry.id, m.draftId));
    if (!d || d.personId !== personId || d.kind !== "draft") {
      throw new LeadError("That draft doesn't exist.");
    }
    option = d.options?.[m.optionIndex];
    channel = d.channel;
    templateId = d.templateId;
    fromDraftId = d.id;
  } else {
    const [c] = await db
      .select({ m: aiChatMessage, chat: aiChat })
      .from(aiChatMessage)
      .innerJoin(aiChat, eq(aiChat.id, aiChatMessage.chatId))
      .where(eq(aiChatMessage.id, m.draftId));
    if (!c || c.chat.personId !== personId || c.chat.userId !== actor.id) {
      throw new LeadError("That draft doesn't exist.");
    }
    const d = c.m.drafts[m.optionIndex];
    option = d ? { label: d.approach, subject: "", text: d.text } : undefined;
    channel = m.channel ?? "LinkedIn message";
  }
  if (!option) throw new LeadError("That option doesn't exist.");

  if (channel === "Call" || channel === "LinkedIn connection note") {
    return db.transaction(async (tx) => {
      const done = await logWithPlanTx(
        tx,
        actor,
        personId,
        channel === "Call"
          ? { action: "callLogged", outcome: "Connected" }
          : { action: "requestSent", withNote: true },
        { note: text, now, override: Boolean(m.override) },
      );
      if (!done.activity) return null;
      const version = templateId
        ? ((
            await tx
              .select({ v: template.version })
              .from(template)
              .where(eq(template.id, templateId))
          )[0]?.v ?? null)
        : null;
      return setDeskFields(tx, actor, done.activity.id, {
        deskChannel: channel,
        fromDraftId,
        optionIndex: m.optionIndex,
        aiSuggestionUsed: true,
        suggestionApproach: option.label.slice(0, 100) || null,
        editLevel: editLevel(option.text, text),
        ...(templateId ? { templateId, templateVersion: version } : {}),
      });
    });
  }
  const situation = await situationOf(db, personId, todayIst(now));
  const sendChannel = DESK_TO_CHANNEL[channel] as "LinkedIn" | "InMail" | "Email" | "WhatsApp";
  return markSent(
    db,
    actor,
    personId,
    {
      text,
      suggestion: option.text,
      approach: option.label,
      templateId,
      channel: sendChannel,
      situation:
        situation.kind === "reply" || situation.kind === "nudge" || situation.kind === "close"
          ? situation.kind
          : null,
      replyBy: situation.kind === "close" ? null : m.replyBy || null,
      deskChannel: channel,
      subject,
      fromDraftId,
      optionIndex: m.optionIndex,
    },
    now,
  );
}

// --- Who they are, and the rep's title -------------------------------------------------------

/** "Who they are" (`person.brief`). Owner or Admin. Audited. */
export async function setBrief(db: Db, actor: Actor, personId: string, brief: string) {
  const text = brief.trim();
  if (text.length > BRIEF_MAX) throw new LeadError("Keep it under 5,000 characters.");
  return db.transaction(async (tx) => {
    const before = await loadOwnLead(tx, actor, personId);
    const [after] = await tx
      .update(person)
      .set({ brief: text || null })
      .where(eq(person.id, personId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Person",
      recordId: personId,
      recordName: after.fullName,
      action: "Updated",
      before: { brief: before.brief },
      after: { brief: after.brief },
    });
    return after;
  });
}

/** The rep's own job title, for sign-offs in drafts. Audited. */
export async function setJobTitle(db: Db, actor: Actor, title: string) {
  const text = title.trim();
  if (text.length > 100) throw new LeadError("Keep the title under 100 characters.");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(user).where(eq(user.id, actor.id));
    if (!before) throw new LeadError("Your account wasn't found.");
    const [after] = await tx
      .update(user)
      .set({ jobTitle: text || null })
      .where(eq(user.id, actor.id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "User",
      recordId: actor.id,
      recordName: after.name,
      action: "Updated",
      before: { jobTitle: before.jobTitle },
      after: { jobTitle: after.jobTitle },
    });
    return after;
  });
}
