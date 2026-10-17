"use server";

// Server Actions for the Personas, Account Filters and Templates pages (F04–F07). Each one:
// requireUser() → the shared permission check (inside the library rules) → the change +
// writeAudit() → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { accountFilterSchema, personaSchema, templateSchema } from "@/lib/validation/library";
import { historyFor } from "../audit-query";
import { templateRevisionsFor } from "../library/queries";
import {
  createItem,
  deleteItem,
  duplicateItem,
  KIND_LABEL,
  KIND_NOUN,
  LibraryError,
  proposeItem,
  setArchived,
  updateItem,
  type LibraryKind,
  type NewItem,
} from "../library/items";

const kindSchema = z.enum(["persona", "accountFilter", "template"]);
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

/** Checks the form for its kind; returns the cleaned item or the field errors to show. */
function parseItem(kind: LibraryKind, input: unknown): NewItem | ActionResult {
  const schema =
    kind === "persona"
      ? personaSchema
      : kind === "accountFilter"
        ? accountFilterSchema
        : templateSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  return { kind, data: parsed.data } as NewItem;
}

const isResult = (x: NewItem | ActionResult): x is ActionResult => "ok" in x;

export async function createLibraryItem(
  kind: LibraryKind,
  type: "Official" | "Personal",
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!kindSchema.safeParse(kind).success || !["Official", "Personal"].includes(type)) {
    return { ok: false, error: "Unknown item type." };
  }
  const item = parseItem(kind, input);
  if (isResult(item)) return item;
  return run(async () => {
    const row = await createItem(getDb(), viewer, type, item);
    refresh();
    return { ok: true, message: `${row.name} created.` };
  });
}

export async function updateLibraryItem(
  kind: LibraryKind,
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!kindSchema.safeParse(kind).success || !idSchema.safeParse(id).success)
    return { ok: false, error: "Unknown item." };
  const item = parseItem(kind, input);
  if (isResult(item)) return item;
  return run(async () => {
    const row = await updateItem(getDb(), viewer, id, item);
    refresh();
    return { ok: true, message: `${row.name} saved.` };
  });
}

type SimpleAction = "archive" | "restore" | "delete" | "duplicate" | "propose";

export async function libraryAction(
  kind: LibraryKind,
  id: string,
  action: SimpleAction,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!kindSchema.safeParse(kind).success || !idSchema.safeParse(id).success)
    return { ok: false, error: "Unknown item." };
  const db = getDb();
  const noun = KIND_NOUN[kind];
  return run(async () => {
    let message: string;
    switch (action) {
      case "archive":
        await setArchived(db, viewer, kind, id, true);
        message = `Archived. It's hidden from pickers but stays on old records.`;
        break;
      case "restore":
        await setArchived(db, viewer, kind, id, false);
        message = `Restored.`;
        break;
      case "delete":
        await deleteItem(db, viewer, kind, id);
        message = `Deleted.`;
        break;
      case "duplicate": {
        const copy = await duplicateItem(db, viewer, kind, id);
        message = `Copied to your Personal ${noun}s as "${copy.name}".`;
        break;
      }
      case "propose":
        await proposeItem(db, viewer, kind, id);
        message = `Proposed as Official. An Admin will review it.`;
        break;
      default:
        return { ok: false, error: "Unknown action." };
    }
    refresh();
    return { ok: true, message };
  });
}

export type HistoryEntry = {
  id: string;
  action: string;
  who: string;
  when: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};

/** An item's own change history (everyone signed in can see it). */
export async function itemHistory(kind: LibraryKind, id: string): Promise<HistoryEntry[]> {
  await requireUser();
  if (!kindSchema.safeParse(kind).success || !idSchema.safeParse(id).success) return [];
  const rows = await historyFor(getDb(), KIND_LABEL[kind], id);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    who: r.userName ?? "System",
    when: formatIst(r.occurredAt),
    changes: r.changes,
  }));
}

export type RevisionEntry = {
  revision: number;
  body: string;
  replacedAt: string;
  replacedBy: string;
};

/** A template's earlier wordings (everyone signed in can see them). */
export async function templateRevisions(id: string): Promise<RevisionEntry[]> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return [];
  const rows = await templateRevisionsFor(getDb(), id);
  return rows.map((r) => ({
    revision: r.revision,
    body: r.body,
    replacedAt: formatIst(r.replacedAt),
    replacedBy: r.replacedBy ?? "System",
  }));
}
