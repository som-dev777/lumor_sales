"use server";

// Server Actions for AI Resources (F20): requireUser() → the permission check and the change +
// writeAudit() inside the rules → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  calendarLinkSchema,
  knowledgeSchema,
  resourceFileMetaSchema,
  resourceLinkSchema,
} from "@/lib/validation/ai-resources";
import { createKnowledge, KnowledgeError, updateKnowledge } from "../knowledge";
import {
  addFileResource,
  addLinkResource,
  removeResource as removeResourceRule,
  ResourceError,
} from "../sales-resources";
import { saveCalendarLink } from "../settings";

const idSchema = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof PermissionError || e instanceof KnowledgeError || e instanceof ResourceError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

const invalid = (issues: Parameters<typeof fieldErrorsFrom>[0]): ActionResult => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: fieldErrorsFrom(issues),
});

export async function saveKnowledge(id: string | null, input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = knowledgeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Unknown file." };
  return run(async () => {
    const row = id
      ? await updateKnowledge(getDb(), viewer, id, parsed.data)
      : await createKnowledge(getDb(), viewer, parsed.data);
    refresh();
    return {
      ok: true,
      message: id ? `${row.title} saved (version ${row.version}).` : `${row.title} added.`,
      link: `/ai-resources/knowledge/${row.id}`,
    };
  });
}

export async function saveCalendar(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = calendarLinkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  return run(async () => {
    await saveCalendarLink(getDb(), viewer, parsed.data.calendarLink);
    refresh();
    return { ok: true, message: "Calendar link saved." };
  });
}

export async function addResourceLink(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = resourceLinkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  return run(async () => {
    const row = await addLinkResource(getDb(), viewer, parsed.data);
    refresh();
    return { ok: true, message: `${row.title} added.` };
  });
}

/** Uploads a file (FormData: title, description, category, file). */
export async function addResourceFile(form: FormData): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = resourceFileMetaSchema.safeParse({
    title: form.get("title"),
    description: form.get("description"),
    category: form.get("category"),
  });
  if (!parsed.success) return invalid(parsed.error.issues);
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload." };
  return run(async () => {
    const row = await addFileResource(getDb(), viewer, parsed.data, {
      name: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    refresh();
    return { ok: true, message: `${row.title} uploaded.` };
  });
}

export async function removeResource(id: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Unknown resource." };
  return run(async () => {
    const row = await removeResourceRule(getDb(), viewer, id);
    refresh();
    return { ok: true, message: `${row.title} removed.` };
  });
}
