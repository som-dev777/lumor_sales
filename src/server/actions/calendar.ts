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
  scheduleMeetingSchema,
  workEmail,
} from "@/lib/validation/calendar";
import {
  addGuest,
  addTeammate,
  BookingFieldsError,
  cancelByHost,
  cancelByToken,
  createBooking,
  removeGuest,
  removeTeammate,
  rescheduleByHost,
  rescheduleByToken,
  rescheduleSlots,
  saveAvailability,
  saveMeetingType,
  scheduleMeeting,
  setMeetingTypeActive,
} from "../calendar";
import { disconnectGoogle } from "../google/google";
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
    return { ok: false, error: "Unknown event." };
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

export async function rescheduleSlotsAction(
  bookingId: string,
): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success) return { ok: false, error: "Unknown booking." };
  try {
    const slots = await rescheduleSlots(getDb(), viewer, bookingId, await appNow());
    return { ok: true, slots: slots.map((s) => s.toISOString()) };
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: "Couldn't load free times." };
  }
}

export async function rescheduleBookingAction(
  bookingId: string,
  startsAt: string,
): Promise<ActionResult & { id?: string }> {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success) return { ok: false, error: "Unknown booking." };
  if (!z.iso.datetime().safeParse(startsAt).success) return { ok: false, error: "Pick a time." };
  const now = await appNow();
  try {
    const { booking } = await rescheduleByHost(getDb(), viewer, bookingId, startsAt, now);
    refresh();
    return {
      ok: true,
      message: "Meeting moved. They've been emailed the new time.",
      id: booking.id,
    };
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: "Couldn't reschedule. Please try again." };
  }
}

/** The rep schedules a meeting themselves, with To and CC recipients (D-043). */
export async function scheduleMeetingAction(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = scheduleMeetingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const now = await appNow();
  return run(async () => {
    const b = await scheduleMeeting(getDb(), viewer, parsed.data, now);
    refresh();
    return {
      ok: true,
      message: `${b.title ?? "Meeting"} is on your calendar${parsed.data.to.length ? " and the invitation is on its way" : ""}.`,
    };
  });
}

export async function addTeammateAction(bookingId: string, userId: string) {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success || !z.string().min(1).max(100).safeParse(userId).success) {
    return { ok: false as const, error: "Unknown." };
  }
  const now = await appNow();
  return run(async () => {
    const r = await addTeammate(getDb(), viewer, bookingId, userId, now);
    refresh();
    return {
      ok: true,
      message: r.busy
        ? `${r.name} added. Heads-up: they already have something at that time.`
        : `${r.name} added and notified.`,
    };
  });
}

/** Add a guest to a meeting by email (D-045). */
export async function addGuestAction(bookingId: string, email: string) {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success) return { ok: false as const, error: "Unknown booking." };
  const parsed = workEmail.safeParse(email ?? "");
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const now = await appNow();
  return run(async () => {
    await addGuest(getDb(), viewer, bookingId, parsed.data, now);
    refresh();
    return { ok: true, message: `${parsed.data} added and invited.` };
  });
}

export async function removeGuestAction(bookingId: string, email: string) {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success || typeof email !== "string" || email.length > 200) {
    return { ok: false as const, error: "Unknown." };
  }
  const now = await appNow();
  return run(async () => {
    await removeGuest(getDb(), viewer, bookingId, email, now);
    refresh();
    return { ok: true, message: "Guest removed." };
  });
}

export async function removeTeammateAction(bookingId: string, userId: string) {
  const viewer = await requireUser();
  if (!id.safeParse(bookingId).success || !z.string().min(1).max(100).safeParse(userId).success) {
    return { ok: false as const, error: "Unknown." };
  }
  const now = await appNow();
  return run(async () => {
    await removeTeammate(getDb(), viewer, bookingId, userId, now);
    refresh();
    return { ok: true, message: "Removed from the meeting." };
  });
}

export async function disconnectGoogleAction(): Promise<ActionResult> {
  const viewer = await requireUser();
  return run(async () => {
    await disconnectGoogle(getDb(), viewer, viewer.id);
    refresh();
    return { ok: true, message: "Google Calendar disconnected." };
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
    if (e instanceof BookingFieldsError) {
      return { ok: false, error: e.message, fieldErrors: e.fields };
    }
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
