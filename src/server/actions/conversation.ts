"use server";

// Server Actions for the conversation thread (F18). Each one: requireUser() → the permission
// check, the change and its audit entry in one transaction (src/server/conversation.ts) →
// refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { entrySchema, pastedRowsSchema } from "@/lib/validation/conversation";
import { addEntries, addEntry } from "../conversation";
import { LeadError } from "../leads/companies";
import { GuardrailWarning } from "../plans/enrolment";
import { PlanError } from "../plans/plans";
import type { LogResult } from "./leads";

const id = z.uuid();

function failure(e: unknown): LogResult {
  if (e instanceof GuardrailWarning) {
    return {
      ok: false,
      error: e.message,
      warnings: e.findings.map((f) => ({ rule: f.rule, message: f.message })),
    };
  }
  if (e instanceof LeadError || e instanceof PlanError || e instanceof PermissionError) {
    return { ok: false, error: e.message };
  }
  console.error(e);
  return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
}

/** Adds one message or note. May ask "Is this step N?" (asStep) or "Log anyway?" (override). */
export async function addThreadEntry(
  personId: string,
  input: unknown,
  opts: { asStep?: boolean; override?: boolean } = {},
): Promise<LogResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await addEntry(getDb(), viewer, personId, parsed.data, {
      now: await appNow(),
      asStep: Boolean(opts.asStep),
      override: Boolean(opts.override),
    });
    refresh();
    return {
      ok: true,
      message:
        parsed.data.from === "note"
          ? "Note added."
          : opts.asStep
            ? "Added to the conversation as their plan step."
            : "Added to the conversation.",
    };
  } catch (e) {
    return failure(e);
  }
}

/** Saves the rows of a pasted conversation the rep reviewed (F18). */
export async function savePastedRows(personId: string, rows: unknown): Promise<LogResult> {
  const viewer = await requireUser();
  if (!id.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  const parsed = pastedRowsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const n = await addEntries(getDb(), viewer, personId, parsed.data, await appNow());
    refresh();
    return { ok: true, message: `${n} ${n === 1 ? "message" : "messages"} added.` };
  } catch (e) {
    return failure(e);
  }
}
