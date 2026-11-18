"use server";

// Server Actions for outreach sprints and Add many (F30, D-065). Each one: requireUser() → the
// permission check and the change with its audit entry in one transaction (src/server/sprint.ts,
// src/server/leads/bulk-add.ts). The sprint keeps its own queue, so only Add many refreshes.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { DESK_CHANNELS } from "@/lib/db/enums";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { AiError } from "../ai/client";
import { syncLinkedInEmails, type SyncResult } from "../google/linkedin-mail";
import { addMany, type BulkResult } from "../leads/bulk-add";
import { LeadError } from "../leads/companies";
import { GuardrailWarning } from "../plans/enrolment";
import { PlanError } from "../plans/plans";
import { draftFor, sprintAccepted, sprintNotAFit, sprintSent, type SprintDraft } from "../sprint";

export type SprintResult<T = undefined> =
  { ok: true; data?: T } | { ok: false; error: string; warnings?: string[] };

const id = z.uuid();
const KINDS = ["connect", "first", "next", "reply"] as const;

function failure(e: unknown): { ok: false; error: string; warnings?: string[] } {
  if (e instanceof GuardrailWarning) {
    return { ok: false, error: e.message, warnings: e.findings.map((f) => f.message) };
  }
  if (e instanceof LeadError || e instanceof PlanError || e instanceof PermissionError) {
    return { ok: false, error: e.message };
  }
  if (e instanceof AiError) {
    return {
      ok: false,
      error: `The AI couldn't draft this one (${e.message}). Write it yourself.`,
    };
  }
  console.error(e);
  return {
    ok: false,
    error: errorMessage(e, "Couldn't save. Check your connection and try again."),
  };
}

/** The card's note or message: an unsent draft, or a new one from the Outreach Desk. */
export async function sprintDraft(
  personId: string,
  input: unknown,
): Promise<SprintResult<SprintDraft>> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z.object({ kind: z.enum(KINDS), channel: z.enum(DESK_CHANNELS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown card." };
  try {
    return {
      ok: true,
      data: await draftFor(getDb(), viewer, personId, parsed.data.kind, parsed.data.channel),
    };
  } catch (e) {
    return failure(e);
  }
}

export async function sprintSend(personId: string, input: unknown): Promise<SprintResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = z
    .object({
      kind: z.enum(KINDS),
      text: z.string().max(5000, "That's too long."),
      draftId: z.uuid().nullish(),
      optionIndex: z.number().int().min(0).max(5).nullish(),
      override: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await sprintSent(getDb(), viewer, personId, parsed.data, await appNow());
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function sprintAccept(personId: string): Promise<SprintResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  try {
    await sprintAccepted(getDb(), viewer, personId, await appNow());
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function sprintNotFit(personId: string): Promise<SprintResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  try {
    await sprintNotAFit(getDb(), viewer, personId, await appNow());
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function addManyPeople(input: unknown): Promise<SprintResult<BulkResult>> {
  const viewer = await requireUser();
  const parsed = z
    .object({
      text: z.string().max(100_000, "That's too much text. Paste up to 50 lines."),
      companyName: z.string().trim().max(200).nullish(),
      personaId: z.uuid().nullish().or(z.literal("")),
      accountFilterId: z.uuid().nullish().or(z.literal("")),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { text, ...defaults } = parsed.data;
  try {
    const data = await addMany(getDb(), viewer, text, defaults);
    refresh();
    return { ok: true, data };
  } catch (e) {
    return failure(e);
  }
}

/** Check now (D-066): reads the rep's new LinkedIn emails from Gmail and logs them. */
export async function checkLinkedInEmails(): Promise<SprintResult<SyncResult & { ok: true }>> {
  const viewer = await requireUser();
  try {
    const r = await syncLinkedInEmails(getDb(), viewer, await appNow());
    if (!r.ok) return { ok: false, error: r.problem };
    refresh();
    return { ok: true, data: r };
  } catch (e) {
    return failure(e);
  }
}
