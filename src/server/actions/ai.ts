"use server";

// Server Actions for the AI features (F08–F10) and the changes their panels make. Each one:
// requireUser() → the permission check and audit inside the rules → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { REPLY_TYPES } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  applyNextStep,
  draftFromTemplate,
  markSent,
  savePastedReply,
  setReplyType,
  suggestReplies,
  summariseThread,
  type ReplyResult,
} from "../ai/assist";
import { AiError } from "../ai/client";
import { LeadError } from "../leads/companies";
import { completeTask, rankToday, snoozeLead, type Task } from "../today";

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

/** Saves the pasted reply first, then asks P02 (F09). The reply stays saved if the AI fails. */
export async function assistReply(
  personId: string,
  text: string,
): Promise<AiResult<{ activityId: string; result: ReplyResult | null; aiError: string | null }>> {
  const viewer = await requireUser();
  const parsed = pasted.safeParse(text);
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  const saved = await run(() => savePastedReply(getDb(), viewer, personId, parsed.data));
  if (!saved.ok) return saved;
  refresh();
  const ai = await run(() => suggestReplies(getDb(), viewer, saved.data.id));
  return {
    ok: true,
    data: {
      activityId: saved.data.id,
      result: ai.ok ? ai.data : null,
      aiError: ai.ok ? null : ai.error,
    },
  };
}

/** Try again for a reply that's already saved. */
export async function retryReply(activityId: string): Promise<AiResult<ReplyResult>> {
  const viewer = await requireUser();
  if (!id.safeParse(activityId).success) return bad("Unknown reply.");
  return run(() => suggestReplies(getDb(), viewer, activityId));
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
});

export async function sendAiMessage(personId: string, input: unknown) {
  const viewer = await requireUser();
  const parsed = sentSchema.safeParse(input);
  if (!id.safeParse(personId).success || !parsed.success) return bad("Check the message.");
  const r = await run(() => markSent(getDb(), viewer, personId, parsed.data));
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
  thread: string,
): Promise<AiResult<Awaited<ReturnType<typeof summariseThread>>>> {
  const viewer = await requireUser();
  const parsed = pasted.safeParse(thread);
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  if (!parsed.success) return bad(parsed.error.issues[0].message);
  return run(() => summariseThread(getDb(), viewer, personId, parsed.data));
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
  return run(() => rankToday(getDb(), viewer));
}

export async function doneTask(taskId: string) {
  const viewer = await requireUser();
  if (typeof taskId !== "string" || taskId.length > 100) return bad("Unknown task.");
  const r = await run(() => completeTask(getDb(), viewer, taskId));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}

export async function snoozeTask(personId: string) {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return bad("Unknown person.");
  const r = await run(() => snoozeLead(getDb(), viewer, personId));
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, data: null } : r;
}
