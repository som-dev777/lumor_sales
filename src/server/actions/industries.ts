"use server";

// Server Actions for the Industries list. Each one: requireUser() → the permission check, the
// change and its audit entry in one transaction (src/server/industries.ts) → refresh.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { addIndustry, deleteIndustry, renameIndustry } from "../industries";
import { LeadError } from "../leads/companies";

const id = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError)
      return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

export async function saveIndustry(industryId: string | null, name: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (industryId !== null && !id.safeParse(industryId).success)
    return { ok: false, error: "Unknown industry." };
  if (typeof name !== "string") return { ok: false, error: "Enter the industry's name." };
  return run(async () => {
    const row = industryId
      ? await renameIndustry(getDb(), viewer, industryId, name)
      : await addIndustry(getDb(), viewer, name);
    refresh();
    return { ok: true, message: `${row.name} ${industryId ? "saved" : "added"}.` };
  });
}

export async function removeIndustry(industryId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(industryId).success) return { ok: false, error: "Unknown industry." };
  return run(async () => {
    const row = await deleteIndustry(getDb(), viewer, industryId);
    refresh();
    return { ok: true, message: `${row.name} deleted.` };
  });
}
