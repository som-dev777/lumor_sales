"use server";

// Server Actions for the calendar (F22). The rep's own pages: requireUser() → calendar.manage
// inside the rules → the change + writeAudit() → refresh. The public booking pages have no
// signed-in user: each action is checked against the booking link or the private code, and
// audited with the rep as the actor (D-041).
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  availabilitySchema,
  bookingFormSchema,
  meetingTypeSchema,
} from "@/lib/validation/calendar";
import {
  cancelByHost,
  cancelByToken,
  createBooking,
  rescheduleByToken,
  saveAvailability,
  saveMeetingType,
  setMeetingTypeActive,
} from "../calendar";
import { LeadError } from "../leads/companies";

const id = z.uuid();
const slug = z.string().max(60);
const token = z.string().min(20).max(100);
const reasonSchema = z.string().trim().max(500, "Keep the reason under 500 characters.");

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError) {
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

// --- The rep's calendar ----------------------------------------------------------------------

export async function saveMeetingTypeAction(
  meetingTypeId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = meetingTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (meetingTypeId !== null && !id.safeParse(meetingTypeId).success) {
    return { ok: false, error: "Unknown meeting type." };
  }
  return run(async () => {
    const row = await saveMeetingType(getDb(), viewer, meetingTypeId, parsed.data);
    refresh();
    return { ok: true, message: `${row.name} saved.` };
  });
}

export async function switchMeetingType(meetingTypeId: string, active: boolean) {
  const viewer = await requireUser();
  if (!id.safeParse(meetingTypeId).success) return { ok: false as const, error: "Unknown." };
  return run(async () => {
    const row = await setMeetingTypeActive(getDb(), viewer, meetingTypeId, active === true);
    refresh();
    return { ok: true, message: `${row.name} is ${row.active ? "on" : "off"}.` };
  });
}

export async function saveAvailabilityAction(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  return run(async () => {
    await saveAvailability(getDb(), viewer, viewer.id, parsed.data);
    refresh();
    return { ok: true, message: "Availability saved." };
  });
}

export async function cancelBookingAction(bookingId: string, reason: string) {
  const viewer = await requireUser();
  const r = reasonSchema.safeParse(reason ?? "");
  if (!id.safeParse(bookingId).success) return { ok: false as const, error: "Unknown booking." };
  if (!r.success) return { ok: false as const, error: r.error.issues[0].message };
  const now = await appNow();
  return run(async () => {
    await cancelByHost(getDb(), viewer, bookingId, r.data || null, now);
    refresh();
    return { ok: true, message: "Booking cancelled." };
  });
}

// --- Public booking pages (no sign-in; D-041) -------------------------------------------------

export type BookResult =
  { ok: true; token: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function bookSlot(
  profileSlug: string,
  typeSlug: string,
  input: unknown,
): Promise<BookResult> {
  const parsed = bookingFormSchema.safeParse(input);
  if (!slug.safeParse(profileSlug).success || !slug.safeParse(typeSlug).success) {
    return { ok: false, error: "This booking link isn't taking bookings." };
  }
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const now = await appNow();
  try {
    const { token: t } = await createBooking(getDb(), profileSlug, typeSlug, parsed.data, now);
    return { ok: true, token: t };
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: "Couldn't book. Please try again." };
  }
}

export async function cancelMyBooking(code: string, reason: string): Promise<ActionResult> {
  const r = reasonSchema.safeParse(reason ?? "");
  if (!token.safeParse(code).success) return { ok: false, error: "That booking doesn't exist." };
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const now = await appNow();
  return run(async () => {
    await cancelByToken(getDb(), code, r.data || null, now);
    refresh();
    return { ok: true, message: "Your booking is cancelled." };
  });
}

export async function rescheduleMyBooking(code: string, startsAt: string): Promise<BookResult> {
  if (!token.safeParse(code).success) return { ok: false, error: "That booking doesn't exist." };
  if (!z.iso.datetime().safeParse(startsAt).success) return { ok: false, error: "Pick a time." };
  const now = await appNow();
  try {
    const { token: t } = await rescheduleByToken(getDb(), code, startsAt, now);
    return { ok: true, token: t };
  } catch (e) {
    if (e instanceof LeadError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't reschedule. Please try again." };
  }
}
