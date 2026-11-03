// Calendar and booking links (F22). Reps set their hours and meeting types (signed in, checked
// with calendar.manage and audited). Visitors book from the public pages without signing in:
// each of those changes is checked against the booking link or the booking's private code
// instead, and audited with the rep as the actor (D-041).
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  activity,
  booking,
  bookingParticipant,
  calendarProfile,
  meetingType,
  person,
  user,
} from "@/lib/db/schema";
import { buildIcs, googleCalendarLink, type CalendarEvent } from "@/lib/ics";
import { assertCan, can, PermissionError, type Actor } from "@/lib/permissions";
import {
  availableSlots,
  DEFAULT_HOURS,
  explainDay,
  isOffered,
  isoWeekday,
  type Busy,
  type WeeklyHours,
} from "@/lib/slots";
import {
  addDaysIst,
  formatIst,
  fromIstLocal,
  istDayRange,
  istMidnight,
  toIstDate,
  todayIst,
} from "@/lib/time";
import { appUrl, generateToken, hashToken } from "@/lib/tokens";
import type {
  AvailabilityData,
  BookingFormData,
  MeetingTypeData,
  ScheduleMeetingData,
} from "@/lib/validation/calendar";
import { checkAnswers, checkStandardFields, toSlug } from "@/lib/validation/calendar";
import { fieldRules } from "@/lib/booking-fields";
import {
  cancelledMail,
  confirmationMail,
  invitationMail,
  movedMail,
  reminder1Mail,
  reminder24Mail,
  repBookedMail,
  repCancelledMail,
  repMovedMail,
  type InviteeMail,
  type Mail,
  type Where,
} from "./booking-emails";
import { findPersonFor, syncBooked, syncCancelled, syncMoved } from "./booking-sync";
import { pausePlanTx } from "./plans/enrolment";
import { renderMail } from "./calendar-mail";
import { decryptSecret, encryptSecret } from "./google/crypto";
import { emailConfigured, sendEmail } from "./email";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  googleBusy,
  googleBusyCheck,
  updateGoogleEvent,
} from "./google/google";
import { LeadError } from "./leads/companies";
import { quickLogTx } from "./leads/quicklog";
import { addNotificationsTx, type NewNotification } from "./notifications";

export const BOOKINGS_PER_EMAIL_PER_DAY = 3;

type Host = { id: string; name: string; email: string; role: "Admin" | "User"; active: boolean };
type MeetingTypeRow = typeof meetingType.$inferSelect;
type BookingRow = typeof booking.$inferSelect;

const actorOf = (h: Host): Actor => ({ id: h.id, role: h.role, active: h.active });

async function loadHost(db: DbOrTx, id: string): Promise<Host> {
  const [h] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    })
    .from(user)
    .where(eq(user.id, id));
  if (!h) throw new LeadError("That person doesn't exist.");
  return h;
}

// --- The rep's calendar ----------------------------------------------------------------------

export type ProfileView = {
  slug: string;
  weeklyHours: WeeklyHours;
  daysOff: string[];
  /** Where booking emails go; null = the login email. */
  notifyEmail: string | null;
  /** "Co-founder, Lumor" after the rep's name in emails (D-043). */
  emailTitle: string | null;
  /** Take Google Calendar busy times out of the slots (D-047). */
  useGoogleBusy: boolean;
  /** False until the rep saves their hours or creates a meeting type. */
  saved: boolean;
};

async function freeProfileSlug(db: DbOrTx, base: string, exceptUserId?: string) {
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base.slice(0, 37)}${i}`;
    const [taken] = await db
      .select({ userId: calendarProfile.userId })
      .from(calendarProfile)
      .where(eq(calendarProfile.slug, slug));
    if (!taken || taken.userId === exceptUserId) return slug;
  }
  return `${base.slice(0, 30)}${Date.now().toString(36)}`;
}

/** The rep's hours and link name; Monday–Friday 10:00–18:00 until they save their own. */
export async function profileView(db: DbOrTx, owner: { id: string; name: string }) {
  const [row] = await db.select().from(calendarProfile).where(eq(calendarProfile.userId, owner.id));
  if (row) {
    return {
      slug: row.slug,
      weeklyHours: row.weeklyHours,
      daysOff: row.daysOff,
      notifyEmail: row.notifyEmail,
      emailTitle: row.emailTitle,
      useGoogleBusy: row.useGoogleBusy,
      saved: true,
    };
  }
  return {
    slug: await freeProfileSlug(db, toSlug(owner.name.split(" ")[0], "rep")),
    weeklyHours: DEFAULT_HOURS,
    daysOff: [],
    notifyEmail: null,
    emailTitle: null,
    useGoogleBusy: true,
    saved: false,
  } satisfies ProfileView;
}

async function ensureProfileTx(tx: DbOrTx, actor: Actor, owner: { id: string; name: string }) {
  const [row] = await tx.select().from(calendarProfile).where(eq(calendarProfile.userId, owner.id));
  if (row) return row;
  const view = await profileView(tx, owner);
  const [created] = await tx
    .insert(calendarProfile)
    .values({
      userId: owner.id,
      slug: view.slug,
      weeklyHours: view.weeklyHours,
      daysOff: [],
      createdBy: actor.id,
    })
    .returning();
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Calendar",
    recordId: created.id,
    recordName: `${owner.name}'s calendar`,
    action: "Created",
    after: { slug: created.slug, weeklyHours: created.weeklyHours },
  });
  return created;
}

/** Saves the rep's weekly hours, days off and link name. */
export async function saveAvailability(
  db: Db,
  actor: Actor,
  ownerId: string,
  data: AvailabilityData,
) {
  assertCan(actor, "calendar.manage", { ownerId });
  return db.transaction(async (tx) => {
    const owner = await loadHost(tx, ownerId);
    const before = await ensureProfileTx(tx, actor, owner);
    const [taken] = await tx
      .select({ id: calendarProfile.id })
      .from(calendarProfile)
      .where(and(eq(calendarProfile.slug, data.slug), ne(calendarProfile.id, before.id)));
    if (taken) throw new LeadError("That link name is taken. Try another.");
    const weeklyHours: WeeklyHours = {};
    for (const day of ["1", "2", "3", "4", "5", "6", "7"]) {
      weeklyHours[day] = [...(data.weeklyHours[day as keyof typeof data.weeklyHours] ?? [])].sort(
        (a, b) => a.start.localeCompare(b.start),
      );
    }
    const daysOff = [...new Set(data.daysOff)].sort();
    const [after] = await tx
      .update(calendarProfile)
      .set({
        slug: data.slug,
        weeklyHours,
        daysOff,
        notifyEmail: data.notifyEmail,
        emailTitle: data.emailTitle,
        useGoogleBusy: data.useGoogleBusy,
      })
      .where(eq(calendarProfile.id, before.id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Calendar",
      recordId: after.id,
      recordName: `${owner.name}'s calendar`,
      action: "Updated",
      before: {
        slug: before.slug,
        weeklyHours: before.weeklyHours,
        daysOff: before.daysOff,
        notifyEmail: before.notifyEmail,
        emailTitle: before.emailTitle,
        useGoogleBusy: before.useGoogleBusy,
      },
      after: {
        slug: after.slug,
        weeklyHours: after.weeklyHours,
        daysOff: after.daysOff,
        notifyEmail: after.notifyEmail,
        emailTitle: after.emailTitle,
        useGoogleBusy: after.useGoogleBusy,
      },
    });
    return after;
  });
}

// --- Meeting types ---------------------------------------------------------------------------

export async function listMeetingTypes(db: DbOrTx, ownerId: string) {
  return db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.ownerId, ownerId),
        eq(meetingType.hidden, false),
        isNull(meetingType.deletedAt),
      ),
    )
    .orderBy(desc(meetingType.active), asc(meetingType.name));
}

/** The public link of a meeting type. */
export const bookingLink = (profileSlug: string, typeSlug: string) =>
  `${appUrl()}/book/${profileSlug}/${typeSlug}`;

/** The rep's active meeting types with their links (for the person page and the AI). */
export async function bookingLinksFor(db: DbOrTx, ownerId: string) {
  const [profile] = await db
    .select({ slug: calendarProfile.slug })
    .from(calendarProfile)
    .where(eq(calendarProfile.userId, ownerId));
  if (!profile) return [];
  const types = await db
    .select({
      name: meetingType.name,
      slug: meetingType.slug,
      durationMin: meetingType.durationMin,
    })
    .from(meetingType)
    .where(
      and(
        eq(meetingType.ownerId, ownerId),
        eq(meetingType.active, true),
        eq(meetingType.hidden, false),
        isNull(meetingType.deletedAt),
      ),
    )
    .orderBy(asc(meetingType.createdAt));
  return types.map((t) => ({ ...t, link: bookingLink(profile.slug, t.slug) }));
}

export async function saveMeetingType(
  db: Db,
  actor: Actor,
  id: string | null,
  data: MeetingTypeData,
  ownerId = actor.id,
) {
  return db.transaction(async (tx) => {
    let before: MeetingTypeRow | undefined;
    if (id) {
      [before] = await tx.select().from(meetingType).where(eq(meetingType.id, id));
      if (!before) throw new LeadError("That event doesn't exist.");
      ownerId = before.ownerId;
    }
    assertCan(actor, "calendar.manage", { ownerId });
    const owner = await loadHost(tx, ownerId);
    await ensureProfileTx(tx, actor, owner);
    const [clash] = await tx
      .select({ id: meetingType.id })
      .from(meetingType)
      .where(
        and(
          eq(meetingType.ownerId, ownerId),
          eq(meetingType.slug, data.slug),
          id ? ne(meetingType.id, id) : undefined,
        ),
      );
    if (clash) throw new LeadError("You already have an event with that link name.");
    const values = { ...data, questions: data.questions };
    const [row] = before
      ? await tx.update(meetingType).set(values).where(eq(meetingType.id, before.id)).returning()
      : await tx
          .insert(meetingType)
          .values({ ...values, ownerId, createdBy: actor.id })
          .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Meeting type",
      recordId: row.id,
      recordName: row.name,
      action: before ? "Updated" : "Created",
      before: before ? meetingTypeAudit(before) : undefined,
      after: meetingTypeAudit(row),
    });
    return row;
  });
}

const meetingTypeAudit = (m: MeetingTypeRow) => ({
  name: m.name,
  slug: m.slug,
  durationMin: m.durationMin,
  location: m.location,
  bufferMin: m.bufferMin,
  minNoticeHours: m.minNoticeHours,
  maxDaysAhead: m.maxDaysAhead,
  maxPerDay: m.maxPerDay,
  questions: m.questions,
  active: m.active,
  googleMeet: m.googleMeet,
});

/**
 * Deletes an event for good (D-048). One that was never booked is removed; one with meetings is
 * taken out of every list and its link stops, while its meetings stay on the calendar. Audited.
 */
export async function deleteMeetingType(db: Db, actor: Actor, id: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(meetingType).where(eq(meetingType.id, id));
    if (!before || before.deletedAt || before.hidden) {
      throw new LeadError("That event doesn't exist.");
    }
    assertCan(actor, "calendar.manage", { ownerId: before.ownerId });
    const [{ n: used }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(booking)
      .where(eq(booking.meetingTypeId, id));
    if (used === 0) {
      await tx.delete(meetingType).where(eq(meetingType.id, id));
    } else {
      await tx
        .update(meetingType)
        .set({ deletedAt: now, active: false })
        .where(eq(meetingType.id, id));
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Meeting type",
      recordId: id,
      recordName: before.name,
      action: "Deleted",
      before: meetingTypeAudit(before),
      after: used === 0 ? undefined : { keptForMeetings: used },
    });
    return { removed: used === 0 };
  });
}

/** How many upcoming meetings an event has (for the delete confirmation, D-048). */
export async function upcomingCountOf(db: DbOrTx, id: string, now = new Date()) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(booking)
    .where(
      and(
        eq(booking.meetingTypeId, id),
        eq(booking.status, "Confirmed"),
        gt(booking.startsAt, now),
      ),
    );
  return n;
}

/** Switches a meeting type's booking page on or off (the link stays the same). */
export async function setMeetingTypeActive(db: Db, actor: Actor, id: string, active: boolean) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(meetingType).where(eq(meetingType.id, id));
    if (!before) throw new LeadError("That event doesn't exist.");
    assertCan(actor, "calendar.manage", { ownerId: before.ownerId });
    const [after] = await tx
      .update(meetingType)
      .set({ active })
      .where(eq(meetingType.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Meeting type",
      recordId: id,
      recordName: before.name,
      action: "Updated",
      before: { active: before.active },
      after: { active: after.active },
    });
    return after;
  });
}

// --- Public booking pages --------------------------------------------------------------------

export type BookingPage = {
  host: Host;
  profile: typeof calendarProfile.$inferSelect;
  type: MeetingTypeRow;
};

/** The rep and meeting type behind /book/{rep}/{type}, or null. Deactivated reps have none. */
export async function findBookingPage(
  db: DbOrTx,
  profileSlug: string,
  typeSlug: string,
): Promise<BookingPage | null> {
  const [row] = await db
    .select({ profile: calendarProfile, type: meetingType })
    .from(calendarProfile)
    .innerJoin(meetingType, eq(meetingType.ownerId, calendarProfile.userId))
    .where(
      and(
        eq(calendarProfile.slug, profileSlug),
        eq(meetingType.slug, typeSlug),
        eq(meetingType.hidden, false),
        isNull(meetingType.deletedAt),
      ),
    );
  if (!row) return null;
  const host = await loadHost(db, row.profile.userId);
  return host.active ? { host, ...row } : null;
}

/** The rep's public page (/book/{rep}): their active meeting types. */
export async function findHostPage(db: DbOrTx, profileSlug: string) {
  const [profile] = await db
    .select()
    .from(calendarProfile)
    .where(eq(calendarProfile.slug, profileSlug));
  if (!profile) return null;
  const host = await loadHost(db, profile.userId);
  if (!host.active) return null;
  const types = (await listMeetingTypes(db, host.id)).filter((t) => t.active);
  return { host, profile, types };
}

/** The first booking of a reschedule chain: teammates are kept against it. */
export const rootOf = (b: { id: string; rescheduledFromId: string | null }) =>
  b.rescheduledFromId ?? b.id;

/**
 * Everything that blocks the rep's time from `from` on: confirmed meetings they host or are a
 * teammate on (each with its gap), and their Google Calendar busy times (F26) when given.
 */
async function busyFor(
  db: DbOrTx,
  userId: string,
  from: Date,
  except?: BookingRow | null,
  google: { start: Date; end: Date }[] = [],
): Promise<Busy[]> {
  const rows = await db
    .select({
      start: booking.startsAt,
      end: booking.endsAt,
      // No gaps between meetings (D-048).
      bufferMin: sql<number>`0`,
      meetingTypeId: booking.meetingTypeId,
    })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .where(
      and(
        or(
          eq(booking.hostId, userId),
          sql`exists (select 1 from ${bookingParticipant} where ${bookingParticipant.userId} = ${userId} and ${bookingParticipant.bookingId} = coalesce(${booking.rescheduledFromId}, ${booking.id}))`,
        ),
        eq(booking.status, "Confirmed"),
        gt(booking.endsAt, new Date(from.getTime() - 24 * 3600_000)),
        except ? ne(booking.id, except.id) : undefined,
      ),
    );
  const fromGoogle = google
    // The meeting being moved is in Google too; it mustn't block its own new time.
    .filter(
      (g) =>
        !except ||
        g.start.getTime() !== except.startsAt.getTime() ||
        g.end.getTime() !== except.endsAt.getTime(),
    )
    .map((g) => ({
      ...g,
      bufferMin: 0,
      meetingTypeId: "google",
      label: "busy in your Google Calendar",
    }));
  return [...rows.map((r) => ({ ...r, label: "a meeting" })), ...fromGoogle];
}

const slotArgs = (page: BookingPage, busy: Busy[], now: Date) => ({
  hours: page.profile.weeklyHours,
  daysOff: page.profile.daysOff,
  // No gaps between meetings (D-048), whatever an older event has saved.
  rules: { ...page.type, bufferMin: 0 },
  busy,
  meetingTypeId: page.type.id,
  now,
});

/** The rep's Google busy times for this page's booking window (empty without Google, or off). */
const googleWindow = async (db: Db, page: BookingPage, now: Date) =>
  page.profile?.useGoogleBusy === false
    ? []
    : googleBusy(
        db,
        page.host.id,
        now,
        new Date(now.getTime() + (page.type.maxDaysAhead + 2) * 24 * 3600_000),
      );

/** The free start times on a booking page. */
export async function freeSlots(db: Db, page: BookingPage, now = new Date(), exceptId?: string) {
  return (await bookingSlots(db, page, now, exceptId)).free;
}

/**
 * The booking page's times (D-048): the free ones, and the taken ones (booked, a meeting, busy in
 * Google, or the day's limit reached), which the page shows greyed out. Times inside the
 * minimum notice or on days off aren't shown at all.
 */
export async function bookingSlots(
  db: Db,
  page: BookingPage,
  now = new Date(),
  exceptId?: string,
): Promise<{ free: Date[]; taken: Date[] }> {
  if (!page.type.active) return { free: [], taken: [] };
  const [except, google] = await Promise.all([
    exceptId
      ? db
          .select()
          .from(booking)
          .where(eq(booking.id, exceptId))
          .then((r) => r[0])
      : null,
    googleWindow(db, page, now),
  ]);
  const args = slotArgs(page, await busyFor(db, page.host.id, now, except ?? null, google), now);
  const free = availableSlots(args);
  const taken: Date[] = [];
  const today = todayIst(now);
  for (let d = 0; d <= page.type.maxDaysAhead; d++) {
    const date = addDaysIst(today, d);
    for (const c of explainDay(date, args)) {
      if (!c.reason || c.reason === "day off" || c.reason.startsWith("inside the")) continue;
      taken.push(fromIstLocal(`${date}T${c.time}`)!);
    }
  }
  return { free, taken };
}

export type SlotReportDay = {
  date: string;
  /** "10:00–18:00, 19:00–20:00", or empty when no hours are set that day. */
  hours: string;
  dayOff: boolean;
  /** What takes time out of the hours: Google busy times and meetings (with gaps). */
  blocked: { from: string; to: string; reason: string }[];
  /** Free times offered that day, per event, out of the starts the hours allow, and why the rest aren't. */
  offered: {
    name: string;
    count: number;
    possible: number;
    missing: { time: string; reason: string }[];
  }[];
};

/**
 * Why some times are missing (D-045): for the next days, the rep's hours, what blocks them
 * (Google Calendar busy times, meetings) and how many times each event offers. Also whether
 * Google answered: if it didn't, the booking page ignores Google, so slots can come and go.
 */
export async function slotReport(db: Db, ownerId: string, now = new Date(), days = 7) {
  const [profile] = await db
    .select()
    .from(calendarProfile)
    .where(eq(calendarProfile.userId, ownerId));
  if (!profile) return null;
  const host = await loadHost(db, ownerId);
  const types = (await listMeetingTypes(db, ownerId)).filter((t) => t.active);
  const until = new Date(now.getTime() + (days + 1) * 24 * 3600_000);
  const google = profile.useGoogleBusy
    ? await googleBusyCheck(db, ownerId, now, until)
    : { ok: null, busy: [] as { start: Date; end: Date }[] };
  const meetings = await busyFor(db, ownerId, now, null, []);
  const today = todayIst(now);
  const time = (d: Date) => formatIst(d, "h:mm aaa");
  const busy = [
    ...meetings,
    ...google.busy.map((g) => ({
      ...g,
      bufferMin: 0,
      meetingTypeId: "google",
      label: "busy in your Google Calendar",
    })),
  ];
  const perType = types.map((type) => {
    const args = slotArgs({ host, profile, type }, busy, now);
    return { name: type.name, args, slots: availableSlots(args) };
  });
  const out: SlotReportDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysIst(today, i);
    const { start, end } = istDayRange(date);
    const ranges = profile.weeklyHours[String(isoWeekday(date))] ?? [];
    const inDay = (b: { start: Date; end: Date }) => b.start < end && b.end > start;
    out.push({
      date,
      hours: ranges.map((r) => `${r.start}–${r.end}`).join(", "),
      dayOff: profile.daysOff.includes(date),
      blocked: [
        ...google.busy.filter(inDay).map((b) => ({
          from: time(b.start),
          to: time(b.end),
          reason: "Busy in your Google Calendar",
        })),
        ...meetings.filter(inDay).map((b) => ({
          from: time(b.start),
          to: time(new Date(b.end.getTime() + b.bufferMin * 60_000)),
          reason: b.bufferMin ? "A meeting (and its gap)" : "A meeting",
        })),
      ],
      offered: perType.map((t) => {
        const checks = explainDay(date, t.args);
        return {
          name: t.name,
          count: t.slots.filter((s) => toIstDate(s) === date).length,
          possible: checks.length,
          // Each start time the hours allow but that isn't offered, and why (D-047).
          missing: checks.filter((c) => c.reason).map((c) => ({ time: c.time, reason: c.reason! })),
        };
      }),
    });
  }
  return {
    google: google.ok,
    useGoogleBusy: profile.useGoogleBusy,
    days: out,
    rules: types.map((t) => ({
      name: t.name,
      durationMin: t.durationMin,
      minNoticeHours: t.minNoticeHours,
      maxPerDay: t.maxPerDay,
      bufferMin: t.bufferMin,
    })),
  };
}

/** The next free times of each of the rep's active meeting types (Availability preview). */
export async function previewSlots(db: Db, ownerId: string, now = new Date(), perType = 6) {
  const [profile] = await db
    .select()
    .from(calendarProfile)
    .where(eq(calendarProfile.userId, ownerId));
  if (!profile) return [];
  const host = await loadHost(db, ownerId);
  const types = (await listMeetingTypes(db, ownerId)).filter((t) => t.active);
  const out = [];
  for (const type of types) {
    const slots = await freeSlots(db, { host, profile, type }, now);
    out.push({
      id: type.id,
      name: type.name,
      durationMin: type.durationMin,
      count: slots.length,
      next: slots.slice(0, perType),
    });
  }
  return out;
}

// --- The people on a meeting ------------------------------------------------------------------

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  /** Where their booking emails go. */
  notifyTo: string;
  host: boolean;
};

/** The host and the teammates of a booking, host first. */
export async function teamOf(db: DbOrTx, b: BookingRow): Promise<TeamMember[]> {
  const ids = await db
    .select({ userId: bookingParticipant.userId })
    .from(bookingParticipant)
    .where(eq(bookingParticipant.bookingId, rootOf(b)))
    .orderBy(asc(bookingParticipant.createdAt));
  const all = [b.hostId, ...ids.map((r) => r.userId).filter((id) => id !== b.hostId)];
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      notifyEmail: calendarProfile.notifyEmail,
    })
    .from(user)
    .leftJoin(calendarProfile, eq(calendarProfile.userId, user.id))
    .where(inArray(user.id, all));
  return all
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      notifyTo: r.notifyEmail ?? r.email,
      host: r.id === b.hostId,
    }));
}

const teamLine = (team: TeamMember[]) =>
  team.map((m) => (m.host ? `${m.name} (host)` : m.name)).join(", ");

const whenIst = (d: Date) => `${formatIst(d, "EEE d MMM yyyy, h:mm aaa")} IST`;

/** A meeting's name: its own title (a meeting the rep scheduled), else the event's name. */
export const nameOf = (b: { title: string | null }, page: BookingPage) => b.title ?? page.type.name;

/** The event's name in emails ("Lumor demo"); a scheduled meeting uses its title. */
const emailNameOf = (b: BookingRow, page: BookingPage) =>
  b.title ?? page.type.emailName ?? page.type.name;

/** Where the meeting happens, in the emails' terms (D-043). */
export function whereFor(b: BookingRow, page: BookingPage): Where {
  if (b.mode === "in_person") {
    const place = b.location ?? page.type.inPersonAddress;
    return place ? { kind: "place", text: place } : { kind: "tbc" };
  }
  if (b.meetLink) return { kind: "meet", link: b.meetLink };
  // A Google event that should have its own Meet: never hand out a different link (D-050).
  if (b.googleEventId && usesGoogleMeet(b, page)) {
    return { kind: "text", text: "Google Meet (the link is in your calendar invite)" };
  }
  const loc = b.location ?? page.type.location;
  if (!loc) return null;
  return /^https?:\/\//.test(loc) ? { kind: "link", link: loc } : { kind: "text", text: loc };
}

/** True when the meeting gets its own Google Meet link (D-043, D-050). */
export const usesGoogleMeet = (b: BookingRow, page: BookingPage) =>
  b.mode === "online" && !b.location && (page.type.hidden || page.type.googleMeet);

/** Where the meeting happens, as one line (calendar files, descriptions). */
export function whereOf(b: BookingRow, page: BookingPage): string | null {
  const w = whereFor(b, page);
  if (!w) return null;
  if (w.kind === "meet" || w.kind === "link") return w.link;
  if (w.kind === "tbc") return "In person (place to be confirmed)";
  return w.kind === "place" ? `In person: ${w.text}` : w.text;
}

const meetingLink = (id: string) => `/calendar?booking=${id}`;

/** Notifications for everyone on the meeting except the person who made the change. */
function teamNotices(
  team: TeamMember[],
  actorId: string | null,
  n: Omit<NewNotification, "userId">,
): NewNotification[] {
  return team.filter((m) => m.id !== actorId).map((m) => ({ ...n, userId: m.id }));
}

// --- Booking, cancelling, rescheduling -------------------------------------------------------

const TAKEN = "That time was just taken. Pick another.";

/** A booking form with standard fields the event requires left empty (D-043). */
export class BookingFieldsError extends LeadError {
  constructor(readonly fields: Record<string, string>) {
    super("Please fix the highlighted fields.");
  }
}

/** The private manage code, encrypted for reminder links; null when the key isn't set. */
function sealToken(token: string): string | null {
  try {
    return encryptSecret(token);
  } catch {
    return null;
  }
}

/** The visitor's private link, when the booking kept its code (from 2.7.0). */
function manageUrlOf(b: BookingRow): string | null {
  if (!b.manageTokenEnc) return null;
  try {
    return manageUrl(decryptSecret(b.manageTokenEnc));
  } catch {
    return null;
  }
}

/**
 * Books a slot from a public page. Checks the slot again inside the transaction (and the
 * database refuses two confirmed bookings at the same start). Syncs the person (D-043),
 * notifies the rep, then makes the Google event (F26) and sends the emails.
 */
export async function createBooking(
  db: Db,
  profileSlug: string,
  typeSlug: string,
  input: BookingFormData,
  now = new Date(),
): Promise<{ booking: BookingRow; token: string }> {
  if (input.website) throw new LeadError("Couldn't book. Please try again.");
  const page = await findBookingPage(db, profileSlug, typeSlug);
  if (!page || !page.type.active) throw new LeadError("This booking link isn't taking bookings.");
  const rules = fieldRules(page.type.standardFields);
  const problems = checkStandardFields(rules, input);
  if (Object.keys(problems).length > 0) throw new BookingFieldsError(problems);
  const google = await googleWindow(db, page, now);
  const token = generateToken();
  let saved: BookingRow;
  let sync: BookedResult | null = null;
  const fields = {
    ...input,
    company: rules.company.show ? input.company : "",
    phone: rules.phone.show ? input.phone : null,
    linkedin: rules.linkedin.show ? input.linkedin : null,
    mode: rules.mode.show ? (input.mode ?? "online") : "online",
  } as const;
  try {
    saved = await db.transaction(async (tx) => {
      const since = istMidnight(todayIst(now));
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)` })
        .from(booking)
        .where(
          and(
            eq(booking.inviteeEmail, input.email),
            gte(booking.createdAt, since),
            sql`${booking.rescheduledFromId} IS NULL`,
          ),
        );
      if (n >= BOOKINGS_PER_EMAIL_PER_DAY) {
        throw new LeadError(
          "You've already booked 3 meetings today. Use the link in your confirmation email to change one.",
        );
      }
      const done = await insertBooking(tx, page, fields, token, now, null, google);
      sync = done.sync;
      const row = done.row;
      await addNotificationsTx(tx, null, [
        {
          userId: page.host.id,
          kind: "booked",
          title: `New booking: ${page.type.name} with ${row.inviteeName}`,
          body: `${whenIst(row.startsAt)} · ${row.inviteeName}${row.inviteeCompany ? `, ${row.inviteeCompany}` : ""} (${row.inviteeEmail}) booked from your link${row.mode === "in_person" ? ", in person" : ""}.`,
          link: meetingLink(row.id),
          bookingId: row.id,
        },
      ]);
      return row;
    });
  } catch (e) {
    throw takenOr(e);
  }
  saved = await makeGoogleEvent(db, saved, page);
  if (sync && saved.meetLink) await addLinkToActivity(db, (sync as BookedResult).activityId, saved);
  await sendBookingEmails(db, { kind: "booked", booking: saved, page, token, sync });
  return { booking: saved, token };
}

function takenOr(e: unknown) {
  if (e instanceof LeadError) return e;
  const text =
    String((e as { message?: string })?.message ?? e) +
    String((e as { cause?: unknown })?.cause ?? "");
  return /UNIQUE/i.test(text) && /booking/i.test(text) ? new LeadError(TAKEN) : e;
}

type BookingInput = Omit<BookingFormData, "website" | "phoneCountry" | "mode"> & {
  note?: string | null;
  mode: "online" | "in_person";
  location?: string | null;
};
type BookedResult = Awaited<ReturnType<typeof syncBooked>> & { activityId: string | null };

async function insertBooking(
  tx: DbOrTx,
  page: BookingPage,
  input: BookingInput,
  token: string,
  now: Date,
  replacing: BookingRow | null,
  google: { start: Date; end: Date }[],
  anyTime = false,
): Promise<{ row: BookingRow; sync: BookedResult | null }> {
  const start = new Date(input.startsAt);
  if (!anyTime) {
    const busy = await busyFor(tx, page.host.id, now, replacing, google);
    if (!isOffered(start, slotArgs(page, busy, now))) throw new LeadError(TAKEN);
  }
  const durationMin = replacing
    ? Math.round((replacing.endsAt.getTime() - replacing.startsAt.getTime()) / 60_000)
    : page.type.durationMin;
  const end = new Date(start.getTime() + durationMin * 60_000);
  let answers: { question: string; answer: string }[];
  if (replacing) {
    answers = replacing.answers;
  } else {
    const checked = checkAnswers(page.type.questions, input.answers);
    if (!checked.ok) {
      throw new LeadError(`${page.type.questions[checked.index].label}: ${checked.message}`);
    }
    answers = checked.answers;
  }
  const [row] = await tx
    .insert(booking)
    .values({
      meetingTypeId: page.type.id,
      hostId: page.host.id,
      // The app's clock (the test date switch too), so reminders know how far ahead it was booked.
      createdAt: now,
      startsAt: start,
      endsAt: end,
      inviteeName: input.name,
      inviteeEmail: input.email,
      inviteeCompany: input.company,
      inviteePhone: input.phone,
      inviteeLinkedin: input.linkedin,
      inviteeNote: input.note ?? null,
      answers,
      inviteeTimeZone: input.timeZone,
      manageTokenHash: hashToken(token),
      manageTokenEnc: sealToken(token),
      mode: input.mode,
      location: input.location ?? replacing?.location ?? null,
      personId: replacing?.personId ?? null,
      // The first booking in the chain, so every invite updates the same calendar event.
      rescheduledFromId: replacing ? rootOf(replacing) : null,
      googleEventId: replacing?.googleEventId ?? null,
      meetLink: replacing?.meetLink ?? null,
      // A meeting the rep scheduled keeps its title, recipients and message when it moves.
      title: replacing?.title ?? null,
      toEmails: replacing?.toEmails ?? [],
      ccEmails: replacing?.ccEmails ?? [],
      message: replacing?.message ?? null,
    })
    .returning();
  // Checked again after saving, inside the same transaction (D-047): if two people book
  // overlapping times at once, the second one is refused and nothing is saved for it.
  await assertNoOverlap(tx, page.host.id, row);
  await writeAudit(tx, {
    userId: page.host.id,
    entityType: "Booking",
    recordId: row.id,
    recordName: `${nameOf(row, page)} with ${row.inviteeName}`,
    action: "Created",
    after: {
      meetingType: page.type.name,
      startsAt: formatIst(start),
      invitee: row.inviteeName,
      email: row.inviteeEmail,
      company: row.inviteeCompany,
      mode: row.mode,
      rescheduledFrom: replacing?.id ?? null,
      via: replacing ? "Reschedule" : "Booking page",
    },
  });
  if (replacing) return { row, sync: null };
  const sync = await syncBooked(
    tx,
    {
      source: "Booking page",
      eventName: page.type.name,
      email: row.inviteeEmail,
      name: row.inviteeName,
      company: row.inviteeCompany || null,
      phone: row.inviteePhone,
      linkedin: row.inviteeLinkedin,
      startsAt: row.startsAt,
      where: whereOf(row, page),
      answers,
      newOwner: actorOf(page.host),
    },
    now,
  );
  const [linked] = await tx
    .update(booking)
    .set({ personId: sync.personId })
    .where(eq(booking.id, row.id))
    .returning();
  await writeAudit(tx, {
    userId: page.host.id,
    entityType: "Booking",
    recordId: row.id,
    recordName: `${nameOf(row, page)} with ${row.inviteeName}`,
    action: "Updated",
    before: { personId: null },
    after: { personId: sync.personId, newPerson: sync.created },
  });
  const [logged] = await tx
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.personId, sync.personId), eq(activity.type, "Meeting booked")))
    .orderBy(desc(activity.createdAt))
    .limit(1);
  return { row: linked, sync: { ...sync, activityId: logged?.id ?? null } };
}

/** Refuses a booking that overlaps another confirmed meeting of the rep (hosting or a teammate). */
async function assertNoOverlap(tx: DbOrTx, hostId: string, row: BookingRow) {
  const [clash] = await tx
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        involves(hostId),
        eq(booking.status, "Confirmed"),
        ne(booking.id, row.id),
        lt(booking.startsAt, row.endsAt),
        gt(booking.endsAt, row.startsAt),
      ),
    )
    .limit(1);
  if (clash) throw new LeadError(TAKEN);
}

/** The Meet link, once Google made it, joins the Meeting booked entry on the timeline. */
async function addLinkToActivity(db: Db, activityId: string | null, b: BookingRow) {
  if (!activityId || !b.meetLink) return;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(activity).where(eq(activity.id, activityId));
    if (!before) return;
    const content = `${before.content ?? ""} Google Meet: ${b.meetLink}`.trim();
    await tx.update(activity).set({ content }).where(eq(activity.id, activityId));
    await writeAudit(tx, {
      userId: b.hostId,
      entityType: "Activity",
      recordId: activityId,
      recordName: `Meeting booked with ${b.inviteeName}`,
      action: "Updated",
      before: { content: before.content },
      after: { content, via: "Google" },
    });
  });
}

/** The booking behind a visitor's private code, with its page. Null if there's none. */
export async function findByToken(db: DbOrTx, token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select()
    .from(booking)
    .where(eq(booking.manageTokenHash, hashToken(token)));
  if (!row) return null;
  return { booking: row, page: await pageOf(db, row) };
}

async function pageOf(db: DbOrTx, b: BookingRow): Promise<BookingPage> {
  const [type] = await db.select().from(meetingType).where(eq(meetingType.id, b.meetingTypeId));
  const [profile] = await db
    .select()
    .from(calendarProfile)
    .where(eq(calendarProfile.userId, b.hostId));
  return { host: await loadHost(db, b.hostId), type, profile };
}

async function cancelTx(
  tx: DbOrTx,
  b: BookingRow,
  page: BookingPage,
  by: "invitee" | "host",
  actorId: string,
  reason: string | null,
  now: Date,
) {
  const [after] = await tx
    .update(booking)
    .set({ status: "Cancelled", cancelledAt: now, cancelledBy: by, cancelReason: reason })
    .where(and(eq(booking.id, b.id), eq(booking.status, "Confirmed")))
    .returning();
  if (!after) throw new LeadError("This booking is already cancelled.");
  await writeAudit(tx, {
    userId: actorId,
    entityType: "Booking",
    recordId: b.id,
    recordName: `${page.type.name} with ${b.inviteeName}`,
    action: "Updated",
    before: { status: b.status },
    after: {
      status: "Cancelled",
      cancelledBy: by,
      reason,
      ...(by === "invitee" ? { via: "Booking page" } : {}),
    },
  });
  return after;
}

async function cancelWith(
  db: Db,
  b: BookingRow,
  page: BookingPage,
  by: "invitee" | "host",
  actor: { id: string; name: string } | null,
  reason: string | null,
  now: Date,
) {
  const team = await teamOf(db, b);
  const who = actor?.name ?? b.inviteeName;
  let planResumed = false;
  const after = await db.transaction(async (tx) => {
    const row = await cancelTx(tx, b, page, by, actor?.id ?? page.host.id, reason, now);
    if (b.personId) {
      const r = await syncCancelled(
        tx,
        {
          personId: b.personId,
          eventName: nameOf(b, page),
          startsAt: b.startsAt,
          reason,
          by: who,
          fallback: actorOf(page.host),
        },
        now,
      );
      planResumed = r.planResumed;
    }
    await addNotificationsTx(
      tx,
      actor?.id ?? null,
      teamNotices(team, actor?.id ?? null, {
        kind: "cancelled",
        title: `Cancelled: ${nameOf(b, page)} with ${b.inviteeName}`,
        body: `${whenIst(b.startsAt)} · cancelled by ${who}.${reason ? ` Reason: ${reason}` : ""} On the meeting: ${teamLine(team)}.`,
        link: meetingLink(b.id),
        bookingId: b.id,
      }),
    );
    return row;
  });
  if (b.googleEventId) await deleteGoogleEvent(db, b.hostId, b.googleEventId);
  await sendBookingEmails(db, {
    kind: "cancelled",
    booking: after,
    page,
    reason,
    by: who,
    actorId: actor?.id ?? null,
    team,
    planResumed,
  });
  return after;
}

/** The visitor cancels from their link, any time before it starts. */
export async function cancelByToken(
  db: Db,
  token: string,
  reason: string | null,
  now = new Date(),
) {
  const found = await findByToken(db, token);
  if (!found) throw new LeadError("That booking doesn't exist.");
  const { booking: b, page } = found;
  if (b.status !== "Confirmed") throw new LeadError("This booking is already cancelled.");
  if (b.startsAt <= now) throw new LeadError("This meeting has already started.");
  return cancelWith(db, b, page, "invitee", null, reason, now);
}

/** The rep (or an Admin) cancels from the calendar. */
export async function cancelByHost(
  db: Db,
  actor: Actor,
  id: string,
  reason: string | null,
  now = new Date(),
) {
  const [b] = await db.select().from(booking).where(eq(booking.id, id));
  if (!b) throw new LeadError("That booking doesn't exist.");
  assertCan(actor, "calendar.manage", { ownerId: b.hostId });
  const page = await pageOf(db, b);
  const me = await loadHost(db, actor.id);
  return cancelWith(db, b, page, "host", { id: actor.id, name: me.name }, reason, now);
}

/** Cancels `old` and books `startsAt` in its place, in one transaction. */
async function moveBooking(
  db: Db,
  old: BookingRow,
  page: BookingPage,
  startsAt: string,
  actor: { id: string; name: string } | null,
  now: Date,
): Promise<{ booking: BookingRow; token: string }> {
  if (old.status !== "Confirmed") throw new LeadError("This booking is already cancelled.");
  if (old.startsAt <= now) throw new LeadError("This meeting has already started.");
  // A meeting the rep scheduled can move to any time; a booking follows the event's rules.
  const anyTime = page.type.hidden;
  if (!page.type.active && !anyTime) {
    throw new LeadError("This booking link isn't taking bookings.");
  }
  const team = await teamOf(db, old);
  const google = await googleWindow(db, page, now);
  const fresh = generateToken();
  const who = actor?.name ?? old.inviteeName;
  let saved: BookingRow;
  try {
    saved = await db.transaction(async (tx) => {
      await cancelTx(
        tx,
        old,
        page,
        actor ? "host" : "invitee",
        actor?.id ?? page.host.id,
        "Rescheduled",
        now,
      );
      const { row } = await insertBooking(
        tx,
        page,
        {
          startsAt,
          name: old.inviteeName,
          email: old.inviteeEmail,
          company: old.inviteeCompany,
          phone: old.inviteePhone,
          linkedin: old.inviteeLinkedin,
          note: old.inviteeNote,
          answers: [],
          timeZone: old.inviteeTimeZone,
          mode: old.mode,
          location: old.location,
        },
        fresh,
        now,
        old,
        google,
        anyTime,
      );
      if (row.personId) {
        await syncMoved(
          tx,
          {
            personId: row.personId,
            eventName: nameOf(row, page),
            from: old.startsAt,
            to: row.startsAt,
            by: who,
            fallback: actorOf(page.host),
          },
          now,
        );
      }
      await addNotificationsTx(
        tx,
        actor?.id ?? null,
        teamNotices(team, actor?.id ?? null, {
          kind: "rescheduled",
          title: `Rescheduled: ${nameOf(old, page)} with ${old.inviteeName}`,
          body: `Moved from ${whenIst(old.startsAt)} to ${whenIst(row.startsAt)} by ${who}. On the meeting: ${teamLine(team)}.`,
          link: meetingLink(row.id),
          bookingId: row.id,
        }),
      );
      return row;
    });
  } catch (e) {
    throw takenOr(e);
  }
  if (saved.googleEventId) {
    const ok = await updateGoogleEvent(db, saved.hostId, saved.googleEventId, {
      start: saved.startsAt,
      end: saved.endsAt,
    });
    if (!ok) await googleProblem(db, saved, page, "move the Google Calendar event");
  } else {
    saved = await makeGoogleEvent(db, saved, page);
  }
  await sendBookingEmails(db, {
    kind: "rescheduled",
    booking: saved,
    page,
    token: fresh,
    old,
    by: who,
    actorId: actor?.id ?? null,
    team,
  });
  return { booking: saved, token: fresh };
}

/** The visitor picks a new time: the old booking is cancelled and a new one replaces it. */
export async function rescheduleByToken(
  db: Db,
  token: string,
  startsAt: string,
  now = new Date(),
): Promise<{ booking: BookingRow; token: string }> {
  const found = await findByToken(db, token);
  if (!found) throw new LeadError("That booking doesn't exist.");
  return moveBooking(db, found.booking, found.page, startsAt, null, now);
}

/** The host (or an Admin) moves the meeting; the visitor is emailed a new manage link. */
export async function rescheduleByHost(
  db: Db,
  actor: Actor,
  id: string,
  startsAt: string,
  now = new Date(),
) {
  const [b] = await db.select().from(booking).where(eq(booking.id, id));
  if (!b) throw new LeadError("That booking doesn't exist.");
  assertCan(actor, "calendar.manage", { ownerId: b.hostId });
  const me = await loadHost(db, actor.id);
  return moveBooking(db, b, await pageOf(db, b), startsAt, { id: actor.id, name: me.name }, now);
}

/** Free times the host can move a booking to (the booking's own time doesn't block). */
export async function rescheduleSlots(db: Db, actor: Actor, id: string, now = new Date()) {
  const [b] = await db.select().from(booking).where(eq(booking.id, id));
  if (!b) throw new LeadError("That booking doesn't exist.");
  assertCan(actor, "calendar.manage", { ownerId: b.hostId });
  return freeSlots(db, await pageOf(db, b), now, b.id);
}

// --- Teammates on a meeting (D-042) -----------------------------------------------------------

/** The host, a teammate on the meeting, or an Admin can change who's on it. */
export async function canChangeTeam(db: DbOrTx, actor: Actor, b: BookingRow) {
  if (can(actor, "calendar.manage", { ownerId: b.hostId })) return true;
  if (!actor.active) return false;
  const [row] = await db
    .select({ id: bookingParticipant.id })
    .from(bookingParticipant)
    .where(
      and(eq(bookingParticipant.bookingId, rootOf(b)), eq(bookingParticipant.userId, actor.id)),
    );
  return Boolean(row);
}

async function loadOpenBooking(db: DbOrTx, id: string, now: Date) {
  const [b] = await db.select().from(booking).where(eq(booking.id, id));
  if (!b) throw new LeadError("That booking doesn't exist.");
  if (b.status !== "Confirmed") throw new LeadError("This booking is cancelled.");
  if (b.endsAt <= now) throw new LeadError("This meeting is over.");
  return b;
}

/**
 * Adds a teammate. Returns whether they already had something at that time (a warning only).
 */
export async function addTeammate(
  db: Db,
  actor: Actor,
  bookingId: string,
  userId: string,
  now = new Date(),
): Promise<{ busy: boolean; name: string }> {
  const b = await loadOpenBooking(db, bookingId, now);
  if (!(await canChangeTeam(db, actor, b))) {
    throw new PermissionError("Only the host, people on the meeting or an Admin can do that.");
  }
  const mate = await loadHost(db, userId);
  if (!mate.active) throw new LeadError(`${mate.name}'s account is switched off.`);
  if (mate.id === b.hostId) throw new LeadError(`${mate.name} is hosting this meeting.`);
  const page = await pageOf(db, b);
  const me = await loadHost(db, actor.id);
  const theirBusy = await busyFor(db, mate.id, now);
  const busy = theirBusy.some((x) => x.start < b.endsAt && b.startsAt < x.end);
  await db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: bookingParticipant.id })
      .from(bookingParticipant)
      .where(
        and(eq(bookingParticipant.bookingId, rootOf(b)), eq(bookingParticipant.userId, mate.id)),
      );
    if (exists) throw new LeadError(`${mate.name} is already on this meeting.`);
    await tx
      .insert(bookingParticipant)
      .values({ bookingId: rootOf(b), userId: mate.id, createdBy: actor.id });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Booking",
      recordId: b.id,
      recordName: `${page.type.name} with ${b.inviteeName}`,
      action: "Updated",
      after: { addedTeammate: mate.name },
    });
  });
  const team = await teamOf(db, b);
  await db.transaction((tx) =>
    addNotificationsTx(
      tx,
      actor.id,
      teamNotices(team, actor.id, {
        kind: "added",
        title: `${me.name} added ${mate.id === actor.id ? "themselves" : mate.name} to ${page.type.name} with ${b.inviteeName}`,
        body: `${whenIst(b.startsAt)} · ${b.inviteeName}, ${b.inviteeCompany}. On the meeting: ${teamLine(team)}.`,
        link: meetingLink(b.id),
        bookingId: b.id,
      }),
    ),
  );
  await syncAttendees(db, b, page, team);
  await sendTeammateEmail(db, { b, page, team, mate, by: me.name, added: true });
  return { busy, name: mate.name };
}

/**
 * Adds a guest by email (D-045): a client, a colleague outside the Sales Hub, anyone. They're
 * invited to the Google event (Google emails them) or, without Google, get our invitation with a
 * calendar file. Kept with the meeting's CC list, so they stay when it moves.
 */
export async function addGuest(
  db: Db,
  actor: Actor,
  bookingId: string,
  email: string,
  now = new Date(),
) {
  const b = await loadOpenBooking(db, bookingId, now);
  if (!(await canChangeTeam(db, actor, b))) {
    throw new PermissionError("Only the host, people on the meeting or an Admin can do that.");
  }
  const address = email.trim().toLowerCase();
  const taken = [b.inviteeEmail, ...b.toEmails, ...b.ccEmails];
  if (taken.includes(address)) throw new LeadError(`${address} is already on this meeting.`);
  if (b.ccEmails.length >= 20) throw new LeadError("At most 20 guests.");
  const page = await pageOf(db, b);
  const after = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(booking)
      .set({ ccEmails: [...b.ccEmails, address] })
      .where(eq(booking.id, b.id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Booking",
      recordId: b.id,
      recordName: `${nameOf(b, page)} with ${b.inviteeName}`,
      action: "Updated",
      before: { guests: b.ccEmails },
      after: { guests: row.ccEmails },
    });
    return row;
  });
  const team = await teamOf(db, after);
  await syncAttendees(db, after, page, team);
  // Google doesn't email guests (D-047): ours carries the invite.
  if (emailConfigured()) {
    try {
      await send(
        address,
        page.host.email,
        invitationMail({ ...inviteeMailOf(after, page, null), manageUrl: null }),
        buildIcs(eventOf(after, page, "REQUEST", team)),
      );
    } catch (e) {
      console.error("Guest email failed:", e instanceof Error ? e.message : e);
    }
  }
  return after;
}

/** Removes a guest added by email (D-045). */
export async function removeGuest(
  db: Db,
  actor: Actor,
  bookingId: string,
  email: string,
  now = new Date(),
) {
  const b = await loadOpenBooking(db, bookingId, now);
  if (!(await canChangeTeam(db, actor, b))) {
    throw new PermissionError("Only the host, people on the meeting or an Admin can do that.");
  }
  const address = email.trim().toLowerCase();
  if (!b.ccEmails.includes(address)) throw new LeadError("That guest isn't on this meeting.");
  const page = await pageOf(db, b);
  const after = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(booking)
      .set({ ccEmails: b.ccEmails.filter((e) => e !== address) })
      .where(eq(booking.id, b.id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Booking",
      recordId: b.id,
      recordName: `${nameOf(b, page)} with ${b.inviteeName}`,
      action: "Updated",
      before: { guests: b.ccEmails },
      after: { guests: row.ccEmails },
    });
    return row;
  });
  await syncAttendees(db, after, page, await teamOf(db, after));
  return after;
}

/** Removes a teammate (anyone who may change the team; a teammate may remove themselves). */
export async function removeTeammate(
  db: Db,
  actor: Actor,
  bookingId: string,
  userId: string,
  now = new Date(),
) {
  const b = await loadOpenBooking(db, bookingId, now);
  if (!(await canChangeTeam(db, actor, b))) {
    throw new PermissionError("Only the host, people on the meeting or an Admin can do that.");
  }
  const mate = await loadHost(db, userId);
  const page = await pageOf(db, b);
  const me = await loadHost(db, actor.id);
  const before = await teamOf(db, b);
  await db.transaction(async (tx) => {
    const gone = await tx
      .delete(bookingParticipant)
      .where(
        and(eq(bookingParticipant.bookingId, rootOf(b)), eq(bookingParticipant.userId, mate.id)),
      )
      .returning();
    if (gone.length === 0) throw new LeadError(`${mate.name} isn't on this meeting.`);
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Booking",
      recordId: b.id,
      recordName: `${page.type.name} with ${b.inviteeName}`,
      action: "Updated",
      before: { teammate: mate.name },
      after: { removedTeammate: mate.name },
    });
    await addNotificationsTx(
      tx,
      actor.id,
      teamNotices(before, actor.id, {
        kind: "removed",
        title:
          mate.id === actor.id
            ? `${me.name} left ${page.type.name} with ${b.inviteeName}`
            : `${me.name} removed ${mate.name} from ${page.type.name} with ${b.inviteeName}`,
        body: `${whenIst(b.startsAt)} · ${b.inviteeName}, ${b.inviteeCompany}.`,
        link: meetingLink(b.id),
        bookingId: b.id,
      }),
    );
  });
  const team = await teamOf(db, b);
  await syncAttendees(db, b, page, team);
  if (mate.id !== actor.id) {
    await sendTeammateEmail(db, { b, page, team, mate, by: me.name, added: false });
  }
}

/** Active reps who could join a meeting (not its host). */
export async function teammateChoices(db: DbOrTx) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.active, true))
    .orderBy(asc(user.name));
}

// --- Google Calendar (F26) --------------------------------------------------------------------

async function googleProblem(db: Db, b: BookingRow, page: BookingPage, what: string) {
  await db.transaction((tx) =>
    addNotificationsTx(tx, null, [
      {
        userId: b.hostId,
        kind: "google",
        title: `Google problem: couldn't ${what}`,
        body: `${page.type.name} with ${b.inviteeName}, ${whenIst(b.startsAt)}. The booking stands. Check Calendar → Availability → Google, and send a meeting link yourself if needed.`,
        link: meetingLink(b.id),
        bookingId: b.id,
      },
    ]),
  );
}

const attendeesOf = (b: BookingRow, team: TeamMember[]) => {
  // The person who booked (or a scheduled meeting's To list), then the CC list and any guests
  // added by email (D-043, D-045).
  const guests = [
    ...(b.toEmails.length
      ? b.toEmails.map((email) => ({ email, name: email }))
      : [{ email: b.inviteeEmail, name: b.inviteeName }]),
    ...b.ccEmails.map((email) => ({ email, name: email })),
  ];
  return [...guests, ...team.filter((m) => !m.host).map((m) => ({ email: m.email, name: m.name }))];
};

/** Creates the Google event (with a Meet link when the meeting type asks) and saves it. */
async function makeGoogleEvent(db: Db, b: BookingRow, page: BookingPage): Promise<BookingRow> {
  const team = await teamOf(db, b);
  const result = await createGoogleEvent(
    db,
    b.hostId,
    {
      title: eventTitle(b, page),
      description: eventDescription(b, page),
      start: b.startsAt,
      end: b.endsAt,
      // With Google Meet, the event's own Meet link is the only link (D-050): no other location.
      location: usesGoogleMeet(b, page)
        ? null
        : b.mode === "in_person" || b.location
          ? whereOf(b, page)
          : page.type.location,
      attendees: attendeesOf(b, team),
      // No Meet link for in-person meetings, or when the rep gave their own link (D-043).
      meet: usesGoogleMeet(b, page),
    },
    b.id,
  );
  if (result === null) return b;
  if (!result.ok) {
    await googleProblem(db, b, page, "create the Google Calendar event and Meet link");
    return b;
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(booking)
      .set({ googleEventId: result.eventId, meetLink: result.meetLink })
      .where(eq(booking.id, b.id))
      .returning();
    await writeAudit(tx, {
      userId: b.hostId,
      entityType: "Booking",
      recordId: b.id,
      recordName: `${page.type.name} with ${b.inviteeName}`,
      action: "Updated",
      before: { meetLink: null },
      after: { meetLink: result.meetLink, via: "Google" },
    });
    return row;
  });
}

async function syncAttendees(db: Db, b: BookingRow, page: BookingPage, team: TeamMember[]) {
  if (!b.googleEventId) return;
  const ok = await updateGoogleEvent(db, b.hostId, b.googleEventId, {
    attendees: attendeesOf(b, team),
  });
  if (!ok) await googleProblem(db, b, page, "update the guests on the Google Calendar event");
}

// --- Lists -----------------------------------------------------------------------------------

export type BookingListRow = BookingRow & {
  meetingTypeName: string;
  anyTime: boolean;
  /** The event's own online link and in-person address. */
  typeLocation: string | null;
  typeAddress: string | null;
  personName: string | null;
  hostName: string;
  /** Teammates' names (not the host). */
  teammates: { id: string; name: string }[];
};

/** Whose meetings: everyone's, or one rep's (hosting or a teammate). */
export type MeetingFilter = { userId: string | null };

const involves = (userId: string) =>
  or(
    eq(booking.hostId, userId),
    sql`exists (select 1 from ${bookingParticipant} where ${bookingParticipant.userId} = ${userId} and ${bookingParticipant.bookingId} = coalesce(${booking.rescheduledFromId}, ${booking.id}))`,
  );

async function withTeammates(
  db: DbOrTx,
  rows: {
    b: BookingRow;
    anyTime: boolean;
    meetingTypeName: string;
    typeLocation: string | null;
    typeAddress: string | null;
    personName: string | null;
    hostName: string;
  }[],
): Promise<BookingListRow[]> {
  const roots = [...new Set(rows.map((r) => rootOf(r.b)))];
  const mates = roots.length
    ? await db
        .select({
          bookingId: bookingParticipant.bookingId,
          id: user.id,
          name: user.name,
        })
        .from(bookingParticipant)
        .innerJoin(user, eq(user.id, bookingParticipant.userId))
        .where(inArray(bookingParticipant.bookingId, roots))
        .orderBy(asc(bookingParticipant.createdAt))
    : [];
  return rows.map((r) => ({
    ...r.b,
    anyTime: r.anyTime,
    meetingTypeName: r.meetingTypeName,
    typeLocation: r.typeLocation,
    typeAddress: r.typeAddress,
    personName: r.personName,
    hostName: r.hostName,
    teammates: mates
      .filter((m) => m.bookingId === rootOf(r.b))
      .map((m) => ({ id: m.id, name: m.name })),
  }));
}

const listColumns = {
  b: booking,
  // A meeting the rep scheduled moves to any time (D-043).
  anyTime: meetingType.hidden,
  meetingTypeName: sql<string>`coalesce(${booking.title}, ${meetingType.name})`,
  typeLocation: meetingType.location,
  typeAddress: meetingType.inPersonAddress,
  personName: person.fullName,
  hostName: user.name,
};

/** Bookings for the List view: upcoming (soonest first) or past (latest first). */
export async function listBookings(
  db: DbOrTx,
  filter: MeetingFilter,
  when: "upcoming" | "past",
  now = new Date(),
  limit = 200,
): Promise<BookingListRow[]> {
  const rows = await db
    .select(listColumns)
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .leftJoin(person, eq(person.id, booking.personId))
    .where(
      and(
        filter.userId ? involves(filter.userId) : undefined,
        when === "upcoming" ? gt(booking.endsAt, now) : lt(booking.endsAt, now),
        // A booking moved to a new time is shown once, at its new time.
        sql`not (${booking.status} = 'Cancelled' and ${booking.cancelReason} = 'Rescheduled')`,
      ),
    )
    .orderBy(when === "upcoming" ? asc(booking.startsAt) : desc(booking.startsAt))
    .limit(limit);
  return withTeammates(db, rows);
}

/** Confirmed meetings that overlap [from, to), for the month/week/day views. */
export async function meetingsBetween(
  db: DbOrTx,
  filter: MeetingFilter,
  from: Date,
  to: Date,
): Promise<BookingListRow[]> {
  const rows = await db
    .select(listColumns)
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .leftJoin(person, eq(person.id, booking.personId))
    .where(
      and(
        filter.userId ? involves(filter.userId) : undefined,
        eq(booking.status, "Confirmed"),
        lt(booking.startsAt, to),
        gt(booking.endsAt, from),
      ),
    )
    .orderBy(asc(booking.startsAt))
    .limit(1000);
  return withTeammates(db, rows);
}

export type MeetingDetail = BookingListRow & {
  team: TeamMember[];
  hostId: string;
};

/** One booking with everything the details panel shows. Any signed-in rep may see it. */
export async function meetingDetail(db: DbOrTx, id: string): Promise<MeetingDetail | null> {
  const rows = await db
    .select(listColumns)
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .leftJoin(person, eq(person.id, booking.personId))
    .where(eq(booking.id, id));
  if (rows.length === 0) return null;
  const [row] = await withTeammates(db, rows);
  return { ...row, team: await teamOf(db, rows[0].b) };
}

/** The rep's confirmed meetings today (IST), hosting or as a teammate, for Today. */
export async function meetingsToday(db: DbOrTx, userId: string, now = new Date()) {
  const { start, end } = istDayRange(todayIst(now));
  return myMeetings(db, userId, start, end);
}

/** The rep's confirmed meetings from tomorrow for `days` days (D-045: on Today too). */
export async function upcomingMeetings(db: DbOrTx, userId: string, now = new Date(), days = 7) {
  const tomorrow = addDaysIst(todayIst(now), 1);
  return myMeetings(
    db,
    userId,
    istDayRange(tomorrow).start,
    istDayRange(addDaysIst(tomorrow, days - 1)).end,
  );
}

async function myMeetings(db: DbOrTx, userId: string, start: Date, end: Date) {
  return db
    .select({
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      inviteeName: booking.inviteeName,
      inviteeCompany: booking.inviteeCompany,
      personId: booking.personId,
      meetingTypeName: sql<string>`coalesce(${booking.title}, ${meetingType.name})`,
      location: sql<
        string | null
      >`coalesce(${booking.meetLink}, ${booking.location}, case when ${booking.mode} = 'in_person' then ${meetingType.inPersonAddress} when ${booking.googleEventId} is not null then null else ${meetingType.location} end)`,
      hostName: user.name,
      hosting: sql<boolean>`${booking.hostId} = ${userId}`.mapWith(Boolean),
    })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .where(
      and(
        involves(userId),
        eq(booking.status, "Confirmed"),
        gte(booking.startsAt, start),
        lt(booking.startsAt, end),
      ),
    )
    .orderBy(asc(booking.startsAt));
}

/** A person's bookings (any rep), newest first, for their page. */
export async function bookingsOfPerson(db: DbOrTx, personId: string) {
  return db
    .select({
      id: booking.id,
      startsAt: booking.startsAt,
      status: booking.status,
      meetingTypeName: sql<string>`coalesce(${booking.title}, ${meetingType.name})`,
      hostName: user.name,
    })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .where(
      and(
        eq(booking.personId, personId),
        sql`not (${booking.status} = 'Cancelled' and ${booking.cancelReason} = 'Rescheduled')`,
      ),
    )
    .orderBy(desc(booking.startsAt));
}

/**
 * After a rep adds a person (for example with **Add as person** on a booking): their unlinked
 * bookings with the same email, on this rep's calendar, are linked to them, and an upcoming one
 * logs Meeting booked.
 */
export async function linkBookingsByEmail(
  db: Db,
  actor: Actor,
  p: { id: string; email: string | null; ownerId: string },
  now = new Date(),
) {
  if (!p.email) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(booking)
      .where(
        and(
          involves(actor.id),
          eq(booking.inviteeEmail, p.email!.trim().toLowerCase()),
          sql`${booking.personId} IS NULL`,
        ),
      );
    let logged = false;
    for (const b of rows) {
      await tx.update(booking).set({ personId: p.id }).where(eq(booking.id, b.id));
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Booking",
        recordId: b.id,
        recordName: `Booking with ${b.inviteeName}`,
        action: "Updated",
        before: { personId: null },
        after: { personId: p.id },
      });
      if (!logged && b.status === "Confirmed" && b.startsAt > now && can(actor, "lead.edit", p)) {
        await quickLogTx(
          tx,
          actor,
          p.id,
          { action: "meetingBooked", meetingDate: toIstDate(b.startsAt) },
          { now },
        );
        logged = true;
      }
    }
    return rows.length;
  });
}

// --- Invites and emails ----------------------------------------------------------------------

const eventTitle = (b: BookingRow, page: BookingPage) =>
  b.title ?? `${page.type.name}: ${b.inviteeName} and ${page.host.name}`;

function eventDescription(b: BookingRow, page: BookingPage) {
  // With Google Meet, the event's Meet button is the only way in (D-050): no other link here.
  const where = usesGoogleMeet(b, page) && !b.meetLink ? null : whereOf(b, page);
  if (page.type.hidden) {
    return [b.message ?? "", where ? `Where: ${where}` : ""].filter(Boolean).join("\n");
  }
  return [
    `${page.type.name} (${page.type.durationMin} min), booked from the Lumor booking page.`,
    b.mode === "in_person" ? "In person." : "",
    where ? `Where: ${where}` : "",
    `${b.inviteeName}, ${b.inviteeCompany} (${b.inviteeEmail})`,
    b.inviteePhone ? `Phone: ${b.inviteePhone}` : "",
    b.inviteeNote ? `Note: ${b.inviteeNote}` : "",
    ...b.answers.filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function eventOf(
  b: BookingRow,
  page: BookingPage,
  method: "REQUEST" | "CANCEL",
  team: TeamMember[] = [],
): CalendarEvent {
  return {
    // A rescheduled booking keeps its first booking's id, so calendars move the same event.
    uid: `${rootOf(b)}@lumor-sales-hub`,
    start: b.startsAt,
    end: b.endsAt,
    title: eventTitle(b, page),
    description: eventDescription(b, page),
    location: whereOf(b, page),
    organizer: { name: page.host.name, email: page.host.email },
    attendee: { name: b.inviteeName, email: b.inviteeEmail },
    others: [
      // A scheduled meeting's other To and CC addresses (D-043).
      ...[...b.toEmails, ...b.ccEmails]
        .filter((e) => e !== b.inviteeEmail)
        .map((email) => ({ name: email, email })),
      ...team.filter((m) => !m.host).map((m) => ({ name: m.name, email: m.email })),
    ],
    method,
    // Always increasing: the time of this booking, or of its cancellation.
    sequence: Math.floor((b.cancelledAt ?? b.createdAt).getTime() / 1000),
  };
}

/** The calendar file for a booking (download on the confirmation page). */
export function bookingIcs(b: BookingRow, page: BookingPage) {
  return buildIcs(eventOf(b, page, b.status === "Cancelled" ? "CANCEL" : "REQUEST"));
}

export function bookingGoogleLink(b: BookingRow, page: BookingPage) {
  return googleCalendarLink(eventOf(b, page, "REQUEST"));
}

const manageUrl = (token: string) => `${appUrl()}/booking/${token}`;

type MailJob =
  | {
      kind: "booked";
      booking: BookingRow;
      page: BookingPage;
      token: string;
      sync: BookedResult | null;
      /** The rep who scheduled it themselves (they get no email about it). */
      actorId?: string | null;
    }
  | {
      kind: "cancelled";
      booking: BookingRow;
      page: BookingPage;
      reason: string | null;
      by: string;
      actorId: string | null;
      team: TeamMember[];
      planResumed: boolean;
    }
  | {
      kind: "rescheduled";
      booking: BookingRow;
      page: BookingPage;
      token: string;
      old: BookingRow;
      by: string;
      actorId: string | null;
      team: TeamMember[];
    };

async function send(
  to: string | string[],
  replyTo: string,
  mail: Mail,
  ics?: string,
  cancel = false,
  cc: string[] = [],
) {
  const { text, html } = renderMail(mail.content);
  return sendEmail({
    to,
    cc,
    replyTo,
    subject: mail.subject,
    text,
    html,
    ...(ics
      ? {
          attachments: [
            {
              filename: cancel ? "cancel.ics" : "invite.ics",
              content: ics,
              contentType: `text/calendar; method=${cancel ? "CANCEL" : "REQUEST"}`,
            },
          ],
        }
      : {}),
  });
}

/** The details the person who booked sees in their emails. */
function inviteeMailOf(b: BookingRow, page: BookingPage, token: string | null): InviteeMail {
  return {
    inviteeName: b.inviteeName,
    eventName: emailNameOf(b, page),
    eventTitle: nameOf(b, page),
    startsAt: b.startsAt,
    timeZone: b.inviteeTimeZone,
    durationMin: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
    where: whereFor(b, page),
    hostName: page.host.name,
    hostTitle: page.profile?.emailTitle ?? null,
    note: page.type.hidden ? b.message : page.type.emailNote,
    // Meetings the rep scheduled have no visitor link: the rep changes them.
    manageUrl: page.type.hidden ? null : token ? manageUrl(token) : manageUrlOf(b),
  };
}

/** The person's page in the Sales Hub, or the meeting on the calendar. */
const openUrlOf = (b: BookingRow) =>
  b.personId ? `${appUrl()}/people/${b.personId}` : `${appUrl()}${meetingLink(b.id)}`;

/**
 * Emails the person who booked (the owner's copy, D-043) and the rep's team. With a Google
 * event, Google sends the calendar invites, so no calendar file is attached. Never throws: the
 * booking is saved.
 */
async function sendBookingEmails(db: Db, job: MailJob) {
  if (!emailConfigured()) return;
  const { booking: b, page } = job;
  try {
    const team = "team" in job ? job.team : await teamOf(db, b);
    const fromGoogle = Boolean(b.googleEventId);
    const cancel = job.kind === "cancelled";
    // Google no longer emails anyone (D-047), so every guest gets our calendar file. Only the
    // host, whose Google Calendar already has the event, goes without it.
    const ics = buildIcs(eventOf(b, page, cancel ? "CANCEL" : "REQUEST", team));
    const actorId = "actorId" in job ? (job.actorId ?? null) : null;
    const invitee = inviteeMailOf(b, page, "token" in job ? job.token : null);
    // A meeting the rep scheduled goes to its To list with CC copied; a booking to its booker.
    const to = page.type.hidden && b.toEmails.length ? b.toEmails : b.inviteeEmail;
    // CC: a scheduled meeting's CC list, or guests added by email (D-045).
    const cc = b.ccEmails;

    if (job.kind === "booked") {
      await send(
        to,
        page.host.email,
        page.type.hidden ? invitationMail(invitee) : confirmationMail(invitee),
        ics,
        false,
        cc,
      );
    } else if (job.kind === "rescheduled") {
      await send(
        to,
        page.host.email,
        movedMail(invitee, job.old.startsAt, job.actorId ? job.by : null),
        ics,
        false,
        cc,
      );
    } else {
      await send(
        to,
        page.host.email,
        cancelledMail(invitee, {
          by: job.actorId ? job.by : null,
          reason: job.reason,
          bookAgainUrl:
            page.type.active && !page.type.hidden
              ? bookingLink(page.profile.slug, page.type.slug)
              : null,
        }),
        ics,
        true,
        cc,
      );
    }

    // The rep and teammates (not whoever made the change).
    const rep = {
      name: b.inviteeName,
      company: b.inviteeCompany || "company not given",
      eventName: emailNameOf(b, page),
      openUrl: openUrlOf(b),
    };
    const repMail =
      job.kind === "booked"
        ? repBookedMail({
            ...rep,
            startsAt: b.startsAt,
            durationMin: invitee.durationMin,
            where: invitee.where,
            answers: b.answers,
            created: job.sync?.created ?? false,
            planPaused: job.sync?.planPaused ?? false,
          })
        : job.kind === "cancelled"
          ? repCancelledMail({
              ...rep,
              startsAt: b.startsAt,
              reason: job.reason,
              by: job.by,
              planResumed: job.planResumed,
            })
          : repMovedMail({ ...rep, from: job.old.startsAt, to: b.startsAt, by: job.by });
    for (const m of team.filter((x) => x.id !== actorId)) {
      // The host gets Google's own invite; teammates without Google get our file.
      await send(
        m.notifyTo,
        b.inviteeEmail,
        repMail,
        m.host && fromGoogle ? undefined : ics,
        cancel,
      );
    }
  } catch (e) {
    console.error("Booking email failed:", e instanceof Error ? e.message : e);
  }
}

async function sendTeammateEmail(
  db: Db,
  j: {
    b: BookingRow;
    page: BookingPage;
    team: TeamMember[];
    mate: Host;
    by: string;
    added: boolean;
  },
) {
  if (!emailConfigured()) return;
  try {
    const [profile] = await db
      .select({ notifyEmail: calendarProfile.notifyEmail })
      .from(calendarProfile)
      .where(eq(calendarProfile.userId, j.mate.id));
    const to = profile?.notifyEmail ?? j.mate.email;
    const where = whereOf(j.b, j.page);
    const subject = j.added
      ? `${j.by} added you to ${j.page.type.name} with ${j.b.inviteeName}`
      : `${j.by} removed you from ${j.page.type.name} with ${j.b.inviteeName}`;
    const ics = buildIcs(
      eventOf(
        j.b,
        j.page,
        j.added ? "REQUEST" : "CANCEL",
        j.added ? j.team : [...j.team, { ...j.mate, notifyTo: to, host: false }],
      ),
    );
    await send(
      to,
      j.page.host.email,
      {
        subject,
        content: {
          heading: subject,
          intro: j.added
            ? `You're on this meeting now. ${j.by} added you.`
            : "You're no longer on this meeting.",
          rows: [
            ["When", whenIst(j.b.startsAt)],
            ["Who", `${j.b.inviteeName}, ${j.b.inviteeCompany} (${j.b.inviteeEmail})`],
            ["On the meeting", teamLine(j.team)],
            ...(where && j.added ? ([["Where", where]] as [string, string][]) : []),
          ],
          button: { label: "Open in Lumor", url: `${appUrl()}${meetingLink(j.b.id)}` },
        },
      },
      ics,
      !j.added,
    );
  } catch (e) {
    console.error("Teammate email failed:", e instanceof Error ? e.message : e);
  }
}

// --- Meetings a rep schedules themselves (D-043) ---------------------------------------------

/** The rep's hidden "Scheduled meeting" event, made the first time they schedule one. */
async function hiddenTypeTx(tx: DbOrTx, actor: Actor, owner: Host) {
  const [found] = await tx
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.ownerId, owner.id),
        eq(meetingType.hidden, true),
        isNull(meetingType.deletedAt),
      ),
    )
    .limit(1);
  if (found) return found;
  await ensureProfileTx(tx, actor, owner);
  const [row] = await tx
    .insert(meetingType)
    .values({
      ownerId: owner.id,
      name: "Scheduled meeting",
      slug: `scheduled-${generateToken()
        .slice(0, 8)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "x")}`,
      durationMin: 30,
      minNoticeHours: 0,
      maxDaysAhead: 90,
      questions: [],
      active: true,
      hidden: true,
      googleMeet: true,
      createdBy: actor.id,
    })
    .returning();
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Meeting type",
    recordId: row.id,
    recordName: row.name,
    action: "Created",
    after: { name: row.name, hidden: true, via: "Schedule a meeting" },
  });
  return row;
}

/**
 * A rep schedules a meeting (D-043): saved on their calendar, linked to a person when the first
 * To address matches one (logging Meeting booked), then Google Meet and the emails (To, with CC
 * copied).
 */
export async function scheduleMeeting(
  db: Db,
  actor: Actor,
  data: ScheduleMeetingData,
  now = new Date(),
) {
  assertCan(actor, "calendar.manage", { ownerId: actor.id });
  const host = await loadHost(db, actor.id);
  const start = new Date(new Date(`${data.date}T${data.time}:00+05:30`).getTime());
  if (start.getTime() <= now.getTime()) throw new LeadError("Pick a time in the future.");
  const end = new Date(start.getTime() + data.durationMin * 60_000);
  const first = data.to[0];
  const mode = data.how === "in_person" ? "in_person" : "online";
  const location =
    data.how === "meet" ? null : data.how === "phone" ? `Phone: ${data.place}` : data.place;
  let saved: BookingRow;
  let page!: BookingPage;
  try {
    saved = await db.transaction(async (tx) => {
      const type = await hiddenTypeTx(tx, actor, host);
      const [profile] = await tx
        .select()
        .from(calendarProfile)
        .where(eq(calendarProfile.userId, host.id));
      page = { host, profile, type };
      const [clash] = await tx
        .select({ id: booking.id })
        .from(booking)
        .where(
          and(
            eq(booking.hostId, host.id),
            eq(booking.status, "Confirmed"),
            lt(booking.startsAt, end),
            gt(booking.endsAt, start),
          ),
        )
        .limit(1);
      if (clash) throw new LeadError("You already have a meeting at that time.");
      const [row] = await tx
        .insert(booking)
        .values({
          meetingTypeId: type.id,
          hostId: host.id,
          startsAt: start,
          endsAt: end,
          inviteeName: first.split("@")[0],
          inviteeEmail: first,
          inviteeCompany: "",
          inviteeTimeZone: "Asia/Kolkata",
          createdAt: now,
          manageTokenHash: hashToken(generateToken()),
          mode,
          location,
          title: data.title,
          toEmails: data.to,
          ccEmails: data.cc,
          message: data.message,
          createdBy: actor.id,
        })
        .returning();
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Booking",
        recordId: row.id,
        recordName: data.title,
        action: "Created",
        after: {
          title: data.title,
          startsAt: formatIst(start),
          durationMin: data.durationMin,
          mode,
          location,
          to: data.to,
          cc: data.cc,
          via: "Schedule a meeting",
        },
      });
      const match = await findPersonFor(tx, { email: first, name: "" });
      if (!match) return row;
      const [linked] = await tx
        .update(booking)
        .set({ personId: match.id, inviteeName: match.fullName })
        .where(eq(booking.id, row.id))
        .returning();
      await writeAudit(tx, {
        userId: actor.id,
        entityType: "Booking",
        recordId: row.id,
        recordName: data.title,
        action: "Updated",
        before: { personId: null },
        after: { personId: match.id },
      });
      if (can(actor, "lead.edit", match)) {
        await quickLogTx(
          tx,
          actor,
          match.id,
          { action: "meetingBooked", meetingDate: toIstDate(start) },
          { note: `Scheduled "${data.title}" for ${whenIst(start)}.`, now },
        );
        await pausePlanTx(tx, actor, match.id, "meeting booked", now);
      }
      return linked;
    });
  } catch (e) {
    throw takenOr(e);
  }
  saved = await makeGoogleEvent(db, saved, page);
  await sendBookingEmails(db, {
    kind: "booked",
    booking: saved,
    page,
    token: "",
    sync: null,
    actorId: actor.id,
  });
  return saved;
}

/** True for a meeting a rep scheduled themselves: it moves to any time they pick. */
export async function isScheduledMeeting(db: DbOrTx, b: BookingRow) {
  const [t] = await db
    .select({ hidden: meetingType.hidden })
    .from(meetingType)
    .where(eq(meetingType.id, b.meetingTypeId));
  return Boolean(t?.hidden);
}

// --- Reminders (D-043) -------------------------------------------------------------------------

const HOUR = 3600_000;

/**
 * Sends the reminders that are due: 24 hours before (only when booked more than a day ahead)
 * and 1 hour before (only when booked more than 2 hours ahead). Each is claimed in the database
 * first, so two runs never send it twice. Called every 15 minutes by the scheduled job.
 */
export async function sendDueReminders(
  db: Db,
  now = new Date(),
  sender: (e: Parameters<typeof sendEmail>[0]) => Promise<boolean> = sendEmail,
) {
  if (!emailConfigured()) return { sent: 0 };
  const rows = await db
    .select({ b: booking })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .where(
      and(
        eq(booking.status, "Confirmed"),
        eq(meetingType.hidden, false),
        gt(booking.startsAt, now),
        lte(booking.startsAt, new Date(now.getTime() + 24 * HOUR)),
        or(sql`${booking.reminder24At} IS NULL`, sql`${booking.reminder1At} IS NULL`),
      ),
    );
  let sent = 0;
  for (const { b } of rows) {
    const left = b.startsAt.getTime() - now.getTime();
    const ahead = b.startsAt.getTime() - b.createdAt.getTime();
    const which: "reminder24At" | "reminder1At" | null =
      !b.reminder1At && left <= HOUR + 5 * 60_000 && ahead > 2 * HOUR
        ? "reminder1At"
        : !b.reminder24At && left > 2 * HOUR && ahead > 24 * HOUR
          ? "reminder24At"
          : null;
    if (!which) continue;
    const column = which === "reminder1At" ? booking.reminder1At : booking.reminder24At;
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(booking)
        .set(which === "reminder1At" ? { reminder1At: now } : { reminder24At: now })
        .where(and(eq(booking.id, b.id), sql`${column} IS NULL`))
        .returning({ id: booking.id });
      if (!row) return false;
      await writeAudit(tx, {
        userId: b.hostId,
        entityType: "Booking",
        recordId: b.id,
        recordName: `Booking with ${b.inviteeName}`,
        action: "Updated",
        before: { [which]: null },
        after: { [which]: now.toISOString(), via: "Reminder" },
      });
      return true;
    });
    if (!claimed) continue;
    const page = await pageOf(db, b);
    const mail = (which === "reminder1At" ? reminder1Mail : reminder24Mail)(
      inviteeMailOf(b, page, null),
    );
    const { text, html } = renderMail(mail.content);
    const ok = await sender({
      to: b.inviteeEmail,
      replyTo: page.host.email,
      subject: mail.subject,
      text,
      html,
    });
    if (ok) sent++;
  }
  return { sent };
}
