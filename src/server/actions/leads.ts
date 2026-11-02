"use server";

// Server Actions for People (F02) and Companies (F03). Each one: requireUser() → the shared
// permission check (inside the rules) → the change + writeAudit() → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  companySchema,
  customerSchema,
  noteSchema,
  personSchema,
  quickLogSchema,
} from "@/lib/validation/leads";
import {
  createCompany,
  deleteCompany,
  LeadError,
  markAsCustomer,
  mergeCompanies,
  updateCompany,
  updateCompanyNotes,
} from "../leads/companies";
import { addNote, createPerson, deletePerson, reassignPeople, updatePerson } from "../leads/people";
import { linkBookingsByEmail } from "../calendar";
import { GuardrailWarning, logWithPlan } from "../plans/enrolment";
import { PlanError } from "../plans/plans";

const idSchema = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LeadError) return { ok: false, error: e.message, link: e.link };
    if (e instanceof PlanError) return { ok: false, error: e.message };
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

export async function savePerson(id: string | null, input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (id !== null && !idSchema.safeParse(id).success)
    return { ok: false, error: "Unknown person." };
  return run(async () => {
    const row = id
      ? await updatePerson(getDb(), viewer, id, parsed.data)
      : await createPerson(getDb(), viewer, parsed.data);
    // A person added from a booking is linked to it (F22).
    if (!id) await linkBookingsByEmail(getDb(), viewer, row, await appNow());
    refresh();
    return {
      ok: true,
      message: `${row.fullName} ${id ? "saved" : "added"}.`,
      link: `/people/${row.id}`,
    };
  });
}

export async function addPersonNote(personId: string, text: string): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = noteSchema.safeParse(text);
  if (!idSchema.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(async () => {
    await addNote(getDb(), viewer, personId, parsed.data);
    refresh();
    return { ok: true, message: "Note added." };
  });
}

export type LogResult = ActionResult & { warnings?: { rule: number; message: string }[] };

export async function logActivity(
  personId: string,
  input: unknown,
  note?: string,
  opts: { asStep?: boolean; override?: boolean } = {},
): Promise<LogResult> {
  const viewer = await requireUser();
  const parsed = quickLogSchema.safeParse(input);
  if (!idSchema.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 5000) : null;
  try {
    const { person } = await logWithPlan(getDb(), viewer, personId, parsed.data, {
      note: cleanNote,
      now: await appNow(),
      asStep: Boolean(opts.asStep),
      override: Boolean(opts.override),
    });
    refresh();
    return {
      ok: true,
      message: opts.asStep
        ? `Logged as their plan step. ${person.fullName} is now ${person.stage}.`
        : `Logged. ${person.fullName} is now ${person.stage}.`,
    };
  } catch (e) {
    if (e instanceof GuardrailWarning) {
      return {
        ok: false,
        error: e.message,
        warnings: e.findings.map((f) => ({ rule: f.rule, message: f.message })),
      };
    }
    return run(async () => {
      throw e;
    });
  }
}

export async function reassign(personIds: string[], ownerId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  const ids = z.array(idSchema).max(1000).safeParse(personIds);
  if (!ids.success || !idSchema.safeParse(ownerId).success)
    return { ok: false, error: "Choose people and a new owner." };
  return run(async () => {
    const n = await reassignPeople(getDb(), viewer, ids.data, ownerId);
    refresh();
    return { ok: true, message: `${n} ${n === 1 ? "lead" : "leads"} reassigned.` };
  });
}

export async function saveCompany(id: string | null, input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (id !== null && !idSchema.safeParse(id).success)
    return { ok: false, error: "Unknown company." };
  return run(async () => {
    const row = id
      ? await updateCompany(getDb(), viewer, id, parsed.data)
      : await createCompany(getDb(), viewer, parsed.data);
    refresh();
    return {
      ok: true,
      message: `${row.name} ${id ? "saved" : "added"}.`,
      link: `/companies/${row.id}`,
    };
  });
}

export async function markCustomer(companyId: string, input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!idSchema.safeParse(companyId).success) return { ok: false, error: "Unknown company." };
  return run(async () => {
    const row = await markAsCustomer(getDb(), viewer, companyId, parsed.data);
    refresh();
    return { ok: true, message: `${row.name} is now a customer.` };
  });
}

const notesSchema = z.string().max(5000, "The notes are too long.");

/** The company page's Notes box (owner or Admin). */
export async function saveCompanyNotes(companyId: string, notes: string): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = notesSchema.safeParse(notes);
  if (!idSchema.safeParse(companyId).success) return { ok: false, error: "Unknown company." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(async () => {
    await updateCompanyNotes(getDb(), viewer, companyId, parsed.data);
    refresh();
    return { ok: true, message: "Notes saved." };
  });
}

/** Admins: delete a company with no people. */
export async function removeCompany(companyId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(companyId).success) return { ok: false, error: "Unknown company." };
  return run(async () => {
    const row = await deleteCompany(getDb(), viewer, companyId);
    return { ok: true, message: `${row.name} deleted.`, link: "/companies" };
  });
}

/** Admins: merge a duplicate company into another. */
export async function mergeCompany(sourceId: string, targetId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(sourceId).success || !idSchema.safeParse(targetId).success)
    return { ok: false, error: "Choose the company to merge into." };
  return run(async () => {
    const { target, moved } = await mergeCompanies(getDb(), viewer, sourceId, targetId);
    return {
      ok: true,
      message: `Merged into ${target.name}. ${moved} ${moved === 1 ? "person" : "people"} moved.`,
      link: `/companies/${target.id}`,
    };
  });
}

/** Admins: delete a person with their activities and plan history. */
export async function removePerson(personId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!idSchema.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  return run(async () => {
    const row = await deletePerson(getDb(), viewer, personId);
    return { ok: true, message: `${row.fullName} deleted.`, link: "/people" };
  });
}
