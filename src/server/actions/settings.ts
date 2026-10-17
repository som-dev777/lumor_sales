"use server";

// Server Actions for Product Facts (F12) and Playbook Settings (F13): requireUser() → the
// permission check and the change + writeAudit() inside the rules → refresh the page.
import { refresh } from "next/cache";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { playbookSettingsSchema, productFactsSchema } from "@/lib/validation/settings";
import { savePlaybookSettings, saveProductFacts } from "../settings";

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

const invalid = (issues: Parameters<typeof fieldErrorsFrom>[0]): ActionResult => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: fieldErrorsFrom(issues),
});

export async function updateProductFacts(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = productFactsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  return run(async () => {
    await saveProductFacts(getDb(), viewer, parsed.data);
    refresh();
    return { ok: true, message: "Product Facts saved." };
  });
}

export async function updatePlaybookSettings(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = playbookSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  return run(async () => {
    await savePlaybookSettings(getDb(), viewer, parsed.data);
    refresh();
    return { ok: true, message: "Playbook Settings saved." };
  });
}
