"use server";

// Approvals (F07): Admins approve or reject proposals. Each action: requireUser() → the
// shared permission check (proposal.decide, inside the rules) → the change + writeAudit().
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { rejectNoteSchema } from "@/lib/validation/library";
import { approveProposal, rejectProposal } from "../library/approvals";
import { LibraryError } from "../library/items";

const idSchema = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LibraryError || e instanceof PermissionError)
      return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

export async function approve(proposalId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(proposalId).success) return { ok: false, error: "Unknown proposal." };
  return run(async () => {
    const item = await approveProposal(getDb(), viewer, proposalId);
    refresh();
    return { ok: true, message: `Approved. "${item.name}" is now Official.` };
  });
}

export async function reject(proposalId: string, note: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(proposalId).success) return { ok: false, error: "Unknown proposal." };
  const parsed = rejectNoteSchema.safeParse(note);
  if (!parsed.success) return { ok: false, error: "The note can be at most 500 characters." };
  return run(async () => {
    await rejectProposal(getDb(), viewer, proposalId, parsed.data);
    refresh();
    return { ok: true, message: "Rejected. The person who proposed it will see your note." };
  });
}
