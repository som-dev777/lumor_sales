"use server";

// Server Actions for the Outreach Desk (D-056). Each one: requireUser() → the permission check,
// the change and its audit entry in one transaction (src/server/ai/desk.ts) → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { DESK_CHANNELS, DESK_TASKS } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { AiError } from "../ai/client";
import {
  addDeskInfo,
  addDeskReply,
  DESK_TEXT_MAX,
  draftOnDesk,
  markDeskSent,
  setBrief,
  setJobTitle,
} from "../ai/desk";
import { LeadError } from "../leads/companies";
import { GuardrailWarning } from "../plans/enrolment";
import { PlanError } from "../plans/plans";

export type DeskResult =
  | { ok: true; message?: string; draftError?: string }
  | { ok: false; error: string; warnings?: string[] };

const id = z.uuid();
const channel = z.enum(DESK_CHANNELS, "Choose a channel.");
const text = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(DESK_TEXT_MAX, "That's too long (5,000 characters).");

const DRAFT_FAILED = "The AI couldn't draft that. Try again, or add more context.";

function failure(
  e: unknown,
  fallback = "Couldn't save. Check your connection and try again.",
): DeskResult {
  if (e instanceof GuardrailWarning) {
    return { ok: false, error: e.message, warnings: e.findings.map((f) => f.message) };
  }
  if (e instanceof LeadError || e instanceof PlanError || e instanceof PermissionError) {
    return { ok: false, error: e.message };
  }
  if (e instanceof AiError) return { ok: false, error: `${DRAFT_FAILED} (${e.message})` };
  console.error(e);
  return { ok: false, error: errorMessage(e, fallback) };
}

/** Initiate, Draft (next message) and Ask AI. */
export async function deskDraft(personId: string, input: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z
    .object({
      task: z.enum(DESK_TASKS),
      channel,
      instruction: z.string().trim().max(DESK_TEXT_MAX).nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await draftOnDesk(getDb(), viewer, personId, parsed.data);
    refresh();
    return { ok: true };
  } catch (e) {
    refresh(); // an Ask AI instruction may have been saved before the AI failed
    return failure(e, DRAFT_FAILED);
  }
}

/** Their reply: saved, then a response drafted on the same channel. */
export async function deskReply(personId: string, input: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z.object({ channel, text }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = getDb();
  try {
    await addDeskReply(db, viewer, personId, parsed.data.channel, parsed.data.text, await appNow());
  } catch (e) {
    return failure(e);
  }
  refresh();
  try {
    await draftOnDesk(db, viewer, personId, { task: "reply", channel: parsed.data.channel });
    refresh();
    return { ok: true, message: "Reply added." };
  } catch (e) {
    const f = failure(e, DRAFT_FAILED);
    return { ok: true, message: "Reply added.", draftError: f.ok ? DRAFT_FAILED : f.error };
  }
}

/** Info about them: a note, no draft. */
export async function deskInfo(personId: string, input: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z.object({ channel, text }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await addDeskInfo(
      getDb(),
      viewer,
      personId,
      parsed.data.channel,
      parsed.data.text,
      await appNow(),
    );
    refresh();
    return { ok: true, message: "Note added." };
  } catch (e) {
    return failure(e);
  }
}

/** Mark as sent / Mark as called. May come back with guardrail warnings ("Log anyway?"). */
export async function deskMark(personId: string, input: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z
    .object({
      source: z.enum(["desk", "chat"]),
      draftId: id,
      optionIndex: z.number().int().min(0).max(5),
      text: z.string().max(DESK_TEXT_MAX),
      subject: z.string().max(200).nullish(),
      channel: channel.optional(),
      override: z.boolean().optional(),
      replyBy: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
        .nullish()
        .or(z.literal("")),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await markDeskSent(getDb(), viewer, personId, parsed.data, await appNow());
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** "Who they are". */
export async function deskBrief(personId: string, brief: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success || typeof brief !== "string") {
    return { ok: false, error: "Unknown person." };
  }
  try {
    await setBrief(getDb(), viewer, personId, brief);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return failure(e);
  }
}

/** The rep's title, for sign-offs. */
export async function deskTitle(title: unknown): Promise<DeskResult> {
  const viewer = await requireUser();
  if (typeof title !== "string") return { ok: false, error: "Type your title." };
  try {
    await setJobTitle(getDb(), viewer, title);
    refresh();
    return { ok: true, message: "Title saved." };
  } catch (e) {
    return failure(e);
  }
}
