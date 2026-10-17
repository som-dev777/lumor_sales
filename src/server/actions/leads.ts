"use server";

// Server Actions for People (F02) and Companies (F03). Each one: requireUser() → the shared
// permission check (inside the rules) → the change + writeAudit() → refresh the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
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
import { createCompany, LeadError, markAsCustomer, updateCompany } from "../leads/companies";
import { addNote, createPerson, reassignPeople, updatePerson } from "../leads/people";
import { quickLog } from "../leads/quicklog";

const idSchema = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LeadError) return { ok: false, error: e.message, link: e.link };
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

export async function logActivity(
  personId: string,
  input: unknown,
  note?: string,
): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = quickLogSchema.safeParse(input);
  if (!idSchema.safeParse(personId).success) return { ok: false, error: "Unknown person." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 5000) : null;
  return run(async () => {
    const { person } = await quickLog(getDb(), viewer, personId, parsed.data, { note: cleanNote });
    refresh();
    return { ok: true, message: `Logged. ${person.fullName} is now ${person.stage}.` };
  });
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
