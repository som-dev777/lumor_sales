"use server";

// Server Actions for the AI features (F08, F10, F18, F23, F24) and the changes their panels make. Each one:
// requireUser() → the permission check and audit inside the rules → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { REPLY_TYPES } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  applyNextStep,
  draftFromTemplate,
  markSent,
  SEND_CHANNELS,
  setReplyType,
  splitConversation,
  suggestNext,
  summariseThread,
  type NextSuggestion,
  type SplitRow,
} from "../ai/assist";
import {
  CHAT_MESSAGE_MAX,
  deleteChat,
  listChats,
  loadChat,
  sendChatMessage,
  type ChatSummary,
  type ChatView,
  type SavedReply,
} from "../ai/chat";
import {
  askAboutCompany,
  fillCompany,
  fillPerson,
  type CompanyAnswer,
  type FillResult,
} from "../ai/autofill";
import { AiError } from "../ai/client";
import { recordingProblem, transcribe } from "../ai/transcribe";
import { LeadError } from "../leads/companies";
import {
  completeTask,
  rankToday,
  removeFollowUp,
  setFollowUp,
  snoozeLead,
  type Task,
} from "../today";

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const id = z.uuid();
const pasted = z.string().trim().min(1, "Paste the message first.").max(20_000, "That's too long.");

async function run<T>(work: () => Promise<T>): Promise<AiResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (e) {
    if (e instanceof AiError || e instanceof LeadError || e instanceof PermissionError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

const bad = (error: string) => ({ ok: false as const, error });

/** P02 v2.0: the next message for wherever the conversation stands (F18). */
export async function suggestNextMessage(personId: string): Promise<AiResult<NextSuggestion>> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  const now = await appNow();
  const r = await run(() => suggestNext(getDb(), viewer, personId, now));
  // The AI's reply type may have been saved on their message.
  if (r.ok) refresh();
  return r;
}

/** P05: splits a pasted conversation for the rep to review. Nothing is saved (F18). */
export async function splitPasted(
  personId: string,
  text: string,
): Promise<AiResult<{ rows: SplitRow[]; notes: string[] }>> {
  const viewer = await requireUser();
  const parsed = pasted.safeParse(text);
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const now = await appNow();
  return run(() => splitConversation(getDb(), viewer, personId, parsed.data, now));
}

export async function changeReplyType(activityId: string, replyType: string) {
  const viewer = await requireUser();
  const type = z.enum(REPLY_TYPES).safeParse(replyType);
  if (!id.safeParse(activityId).success || !type.success) return bad("Choose a reply type.");
  const r = await run(() => setReplyType(getDb(), viewer, activityId, type.data));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

const sentSchema = z.object({
  text: z.string().max(5000, "The message is too long."),
  suggestion: z.string().max(10_000),
  approach: z.string().max(100).nullish(),
  templateId: z.uuid().nullish(),
  channel: z.enum(SEND_CHANNELS).optional(),
  replyBy: z.string().max(10).nullish(),
  situation: z.enum(["start", "reply", "wait", "nudge", "close"]).nullish(),
});

export async function sendAiMessage(personId: string, input: unknown) {
  const viewer = await requireUser();
  const parsed = sentSchema.safeParse(input);
  if (!id.safeParse(personId).success || !parsed.success) return bad("Check the message.");
  const now = await appNow();
  const r = await run(() => markSent(getDb(), viewer, personId, parsed.data, now));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

const stepSchema = z.object({
  stage: z.string().max(40),
  nextAction: z.string().max(200),
  nextActionDate: z.string().max(10),
});

export async function confirmNextStep(personId: string, input: unknown) {
  const viewer = await requireUser();
  const parsed = stepSchema.safeParse(input);
  if (!id.safeParse(personId).success || !parsed.success) return bad("Check the next step.");
  const r = await run(() => applyNextStep(getDb(), viewer, personId, parsed.data));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

export async function summarise(
  personId: string,
): Promise<AiResult<Awaited<ReturnType<typeof summariseThread>>>> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  const now = await appNow();
  return run(() => summariseThread(getDb(), viewer, personId, now));
}

export async function draftMessage(personId: string, templateId: string) {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success || !id.safeParse(templateId).success) {
    return bad("Choose a template.");
  }
  return run(() => draftFromTemplate(getDb(), viewer, personId, templateId));
}

// --- Today (F08) -----------------------------------------------------------------------------

export async function rankMyDay(): Promise<AiResult<{ tasks: Task[]; summary: string | null }>> {
  const viewer = await requireUser();
  const now = await appNow();
  return run(() => rankToday(getDb(), viewer, now));
}

export async function doneTask(taskId: string) {
  const viewer = await requireUser();
  if (typeof taskId !== "string" || taskId.length > 100) return bad("Unknown task.");
  const now = await appNow();
  const r = await run(() => completeTask(getDb(), viewer, taskId, now));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

/** Snooze a non-plan task to a date (D-043); empty = tomorrow. */
export async function snoozeTask(personId: string, until?: string | null) {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (until != null && (typeof until !== "string" || until.length > 10)) return bad("Pick a date.");
  const now = await appNow();
  const r = await run(() => snoozeLead(getDb(), viewer, personId, now, until));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

/** Remove on Today (D-054): clears the follow-up after the rep confirms. */
export async function removeFollowUpTask(personId: string) {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  const now = await appNow();
  const r = await run(() => removeFollowUp(getDb(), viewer, personId, now));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

/** Set next follow-up from Today (D-044): what and when. */
export async function setFollowUpTask(personId: string, nextAction: string, date: string) {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (typeof nextAction !== "string" || nextAction.length > 200) return bad("Keep it short.");
  if (typeof date !== "string" || date.length > 10) return bad("Pick a date.");
  const now = await appNow();
  const r = await run(() => setFollowUp(getDb(), viewer, personId, { nextAction, date }, now));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

// --- AI chat (F23) ---------------------------------------------------------------------------

const chatText = z
  .string()
  .trim()
  .min(1, "Type a message first.")
  .max(CHAT_MESSAGE_MAX, "That message is too long.");

/** Sends a chat message; starts a new chat when chatId is null. Returns the whole chat. */
export async function chatSend(
  personId: string,
  chatId: string | null,
  text: string,
): Promise<AiResult<{ chat: ChatView; chats: ChatSummary[]; savedReply: SavedReply | null }>> {
  const viewer = await requireUser();
  const parsed = chatText.safeParse(text);
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (chatId !== null && !id.safeParse(chatId).success) return bad("Unknown chat.");
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const now = await appNow();
  const db = getDb();
  return run(async () => {
    const { savedReply, ...chat } = await sendChatMessage(
      db,
      viewer,
      personId,
      chatId,
      parsed.data,
      now,
    );
    // A reply type the AI saved shows on the conversation.
    if (savedReply) refresh();
    return { chat, chats: await listChats(db, viewer, personId), savedReply };
  });
}

/** Opens one of the rep's earlier chats. */
export async function chatOpen(chatId: string): Promise<AiResult<ChatView>> {
  const viewer = await requireUser();
  if (!id.safeParse(chatId).success) return bad("Unknown chat.");
  return run(() => loadChat(getDb(), viewer, chatId));
}

/** Deletes one of the rep's own chats; returns the chats left on this person. */
export async function chatDelete(
  personId: string,
  chatId: string,
): Promise<AiResult<ChatSummary[]>> {
  const viewer = await requireUser();
  if (!id.safeParse(chatId).success || !id.safeParse(personId).success) {
    return bad("Unknown chat.");
  }
  const db = getDb();
  return run(async () => {
    await deleteChat(db, viewer, chatId);
    return listChats(db, viewer, personId);
  });
}

// --- Fill with AI (F24) ----------------------------------------------------------------------

/** Suggests values for the empty company fields. Nothing is saved. */
export async function fillCompanyWithAi(form: unknown): Promise<AiResult<FillResult>> {
  const viewer = await requireUser();
  const now = await appNow();
  return run(() => fillCompany(getDb(), viewer, form, now));
}

/** Ask AI about a company (P10, D-054): one answer from the web. Nothing is saved. */
export async function askCompanyAi(input: unknown): Promise<AiResult<CompanyAnswer>> {
  const viewer = await requireUser();
  const now = await appNow();
  return run(() => askAboutCompany(getDb(), viewer, input, now));
}

/** Suggests values for the empty person fields. Nothing is saved. */
export async function fillPersonWithAi(form: unknown): Promise<AiResult<FillResult>> {
  const viewer = await requireUser();
  const now = await appNow();
  return run(() => fillPerson(getDb(), viewer, form, now));
}

// --- Voice typing (D-055) ----------------------------------------------------------------------

/** Turns a short recording into text for an AI text box. Nothing is saved. */
export async function dictate(form: FormData): Promise<AiResult<string>> {
  await requireUser();
  const file = form.get("audio");
  const problem = recordingProblem(file);
  if (problem) return bad(problem);
  return run(() => transcribe(file as Blob));
}
