// Calendar and booking links (F22). Reps set their hours and meeting types (signed in, checked
// with calendar.manage and audited). Visitors book from the public pages without signing in:
// each of those changes is checked against the booking link or the booking's private code
// instead, and audited with the rep as the actor (D-041).
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
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
import { buildIcs, googleCalendarLink } from "@/lib/ics";
import { normaliseLinkedInUrl } from "@/lib/linkedin";
import { assertCan, can, PermissionError, type Actor } from "@/lib/permissions";
import { availableSlots, DEFAULT_HOURS, isOffered, type Busy, type WeeklyHours } from "@/lib/slots";
import { formatIst, istDayRange, istMidnight, toIstDate, todayIst } from "@/lib/time";
import { appUrl, generateToken, hashToken } from "@/lib/tokens";
import type { AvailabilityData, BookingFormData, MeetingTypeData } from "@/lib/validation/calendar";
import { checkAnswers, toSlug } from "@/lib/validation/calendar";
import { personSchema } from "@/lib/validation/leads";
import { renderMail, type MailContent } from "./calendar-mail";
import { emailConfigured, sendEmail } from "./email";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  googleBusy,
  updateGoogleEvent,
} from "./google/google";
import { LeadError } from "./leads/companies";
import { createPersonTx, loadPerson } from "./leads/people";
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
      saved: true,
    };
  }
  return {
    slug: await freeProfileSlug(db, toSlug(owner.name.split(" ")[0], "rep")),
    weeklyHours: DEFAULT_HOURS,
    daysOff: [],
    notifyEmail: null,
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
      .set({ slug: data.slug, weeklyHours, daysOff, notifyEmail: data.notifyEmail })
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
      },
      after: {
        slug: after.slug,
        weeklyHours: after.weeklyHours,
        daysOff: after.daysOff,
        notifyEmail: after.notifyEmail,
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
    .where(eq(meetingType.ownerId, ownerId))
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
    .where(and(eq(meetingType.ownerId, ownerId), eq(meetingType.active, true)))
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
      if (!before) throw new LeadError("That meeting type doesn't exist.");
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
    if (clash) throw new LeadError("You already have a meeting type with that link name.");
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

/** Switches a meeting type's booking page on or off (the link stays the same). */
export async function setMeetingTypeActive(db: Db, actor: Actor, id: string, active: boolean) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(meetingType).where(eq(meetingType.id, id));
    if (!before) throw new LeadError("That meeting type doesn't exist.");
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
    .where(and(eq(calendarProfile.slug, profileSlug), eq(meetingType.slug, typeSlug)));
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
      bufferMin: meetingType.bufferMin,
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
    .map((g) => ({ ...g, bufferMin: 0, meetingTypeId: "google" }));
  return [...rows, ...fromGoogle];
}

const slotArgs = (page: BookingPage, busy: Busy[], now: Date) => ({
  hours: page.profile.weeklyHours,
  daysOff: page.profile.daysOff,
  rules: page.type,
  busy,
  meetingTypeId: page.type.id,
  now,
});

/** The rep's Google busy times for this page's booking window (empty without Google). */
const googleWindow = (db: Db, page: BookingPage, now: Date) =>
  googleBusy(
    db,
    page.host.id,
    now,
    new Date(now.getTime() + (page.type.maxDaysAhead + 2) * 24 * 3600_000),
  );

/** The free start times on a booking page. */
export async function freeSlots(db: Db, page: BookingPage, now = new Date(), exceptId?: string) {
  if (!page.type.active) return [];
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
  return availableSlots(
    slotArgs(page, await busyFor(db, page.host.id, now, except ?? null, google), now),
  );
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

/** Where the meeting happens: its Meet link, else the meeting type's "Where". */
export const whereOf = (b: BookingRow, page: BookingPage) => b.meetLink ?? page.type.location;

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

/**
 * Books a slot from a public page. Checks the slot again inside the transaction (and the
 * database refuses two confirmed bookings at the same start). Links the booking to a person,
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
  const google = await googleWindow(db, page, now);
  const token = generateToken();
  let saved: BookingRow;
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
      const row = await insertBooking(tx, page, input, token, now, null, google);
      await addNotificationsTx(tx, null, [
        {
          userId: page.host.id,
          kind: "booked",
          title: `New booking: ${page.type.name} with ${row.inviteeName}`,
          body: `${whenIst(row.startsAt)} · ${row.inviteeName}, ${row.inviteeCompany} (${row.inviteeEmail}) booked from your link.`,
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
  await sendBookingEmails(db, { kind: "booked", booking: saved, page, token });
  return { booking: saved, token };
}

function takenOr(e: unknown) {
  if (e instanceof LeadError) return e;
  const text =
    String((e as { message?: string })?.message ?? e) +
    String((e as { cause?: unknown })?.cause ?? "");
  return /UNIQUE/i.test(text) && /booking/i.test(text) ? new LeadError(TAKEN) : e;
}

type BookingInput = Omit<BookingFormData, "website" | "phoneCountry"> & { note?: string | null };

async function insertBooking(
  tx: DbOrTx,
  page: BookingPage,
  input: BookingInput,
  token: string,
  now: Date,
  replacing: BookingRow | null,
  google: { start: Date; end: Date }[],
) {
  const start = new Date(input.startsAt);
  const busy = await busyFor(tx, page.host.id, now, replacing, google);
  if (!isOffered(start, slotArgs(page, busy, now))) throw new LeadError(TAKEN);
  const end = new Date(start.getTime() + page.type.durationMin * 60_000);
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
      personId: replacing?.personId ?? null,
      // The first booking in the chain, so every invite updates the same calendar event.
      rescheduledFromId: replacing ? rootOf(replacing) : null,
      googleEventId: replacing?.googleEventId ?? null,
      meetLink: replacing?.meetLink ?? null,
    })
    .returning();
  await writeAudit(tx, {
    userId: page.host.id,
    entityType: "Booking",
    recordId: row.id,
    recordName: `${page.type.name} with ${row.inviteeName}`,
    action: "Created",
    after: {
      meetingType: page.type.name,
      startsAt: formatIst(start),
      invitee: row.inviteeName,
      email: row.inviteeEmail,
      company: row.inviteeCompany,
      rescheduledFrom: replacing?.id ?? null,
      via: replacing ? "Reschedule" : "Booking page",
    },
  });
  const when = whenIst(start);
  if (replacing) {
    if (row.personId) await movedMeeting(tx, page, row, replacing, when);
    return row;
  }
  const personId = await linkPerson(tx, page, row, now, when);
  if (!personId) return row;
  const [linked] = await tx
    .update(booking)
    .set({ personId })
    .where(eq(booking.id, row.id))
    .returning();
  return linked;
}

/** Finds the person by email, then LinkedIn; adds them when there's a LinkedIn profile. */
async function linkPerson(tx: DbOrTx, page: BookingPage, b: BookingRow, now: Date, when: string) {
  const host = actorOf(page.host);
  let [found] = await tx
    .select({ id: person.id, ownerId: person.ownerId })
    .from(person)
    .where(sql`lower(${person.email}) = ${b.inviteeEmail}`)
    .limit(1);
  const norm = b.inviteeLinkedin ? normaliseLinkedInUrl(b.inviteeLinkedin) : null;
  if (!found && norm?.ok) {
    [found] = await tx
      .select({ id: person.id, ownerId: person.ownerId })
      .from(person)
      .where(eq(person.linkedinUrlNormalised, norm.normalised))
      .limit(1);
  }
  if (!found) {
    if (!norm?.ok) return null;
    const created = await createPersonTx(
      tx,
      host,
      personSchema.parse({
        fullName: b.inviteeName,
        linkedinUrl: b.inviteeLinkedin,
        companyName: b.inviteeCompany,
        email: b.inviteeEmail,
        phone: b.inviteePhone ?? "",
        stage: "Prospect",
      }),
      { via: "Booking page" },
    );
    found = { id: created.id, ownerId: created.ownerId };
  }
  if (can(host, "lead.edit", found)) {
    const details = [
      `Booked "${page.type.name}" for ${when} from the booking page.`,
      ...b.answers.filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`),
    ]
      .filter(Boolean)
      .join(" ");
    await quickLogTx(
      tx,
      host,
      found.id,
      { action: "meetingBooked", meetingDate: toIstDate(b.startsAt) },
      { note: details, now },
    );
  }
  return found.id;
}

/** A note on the person's timeline (as the rep), for cancellations and reschedules. */
async function noteOnPerson(tx: DbOrTx, actorId: string, personId: string, text: string) {
  const target = await loadPerson(tx, personId);
  const [row] = await tx
    .insert(activity)
    .values({
      personId,
      companyId: target.companyId,
      userId: actorId,
      createdBy: actorId,
      occurredAt: new Date(),
      type: "Meeting note",
      channel: "LinkedIn",
      content: text,
    })
    .returning();
  await writeAudit(tx, {
    userId: actorId,
    entityType: "Activity",
    recordId: row.id,
    recordName: `Note on ${target.fullName}`,
    action: "Created",
    after: { type: row.type, content: row.content, person: target.fullName, via: "Calendar" },
  });
  return target;
}

/** A rescheduled booking: a note, and "Hold meeting" moves to the new date. */
async function movedMeeting(
  tx: DbOrTx,
  page: BookingPage,
  b: BookingRow,
  old: BookingRow,
  when: string,
) {
  const p = await noteOnPerson(
    tx,
    page.host.id,
    b.personId!,
    `Rescheduled "${page.type.name}" from ${formatIst(old.startsAt, "EEE d MMM, h:mm aaa")} to ${when}.`,
  );
  if (p.nextAction === "Hold meeting" && can(actorOf(page.host), "lead.edit", p)) {
    const date = toIstDate(b.startsAt);
    await tx.update(person).set({ nextActionDate: date }).where(eq(person.id, p.id));
    await writeAudit(tx, {
      userId: page.host.id,
      entityType: "Person",
      recordId: p.id,
      recordName: p.fullName,
      action: "Updated",
      before: { nextActionDate: p.nextActionDate },
      after: { nextActionDate: date, via: "Calendar" },
    });
  }
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

const cancelledNote = (page: BookingPage, b: BookingRow, who: string, reason: string | null) =>
  `"${page.type.name}" on ${formatIst(b.startsAt, "EEE d MMM, h:mm aaa")} IST was cancelled by ${who}.${reason ? ` Reason: ${reason}` : ""}`;

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
  const after = await db.transaction(async (tx) => {
    const row = await cancelTx(tx, b, page, by, actor?.id ?? page.host.id, reason, now);
    if (b.personId) {
      await noteOnPerson(
        tx,
        actor?.id ?? page.host.id,
        b.personId,
        cancelledNote(page, b, who, reason),
      );
    }
    await addNotificationsTx(
      tx,
      actor?.id ?? null,
      teamNotices(team, actor?.id ?? null, {
        kind: "cancelled",
        title: `Cancelled: ${page.type.name} with ${b.inviteeName}`,
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
  if (!page.type.active) throw new LeadError("This booking link isn't taking bookings.");
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
      const row = await insertBooking(
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
        },
        fresh,
        now,
        old,
        google,
      );
      await addNotificationsTx(
        tx,
        actor?.id ?? null,
        teamNotices(team, actor?.id ?? null, {
          kind: "rescheduled",
          title: `Rescheduled: ${page.type.name} with ${old.inviteeName}`,
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

const attendeesOf = (b: BookingRow, team: TeamMember[]) => [
  { email: b.inviteeEmail, name: b.inviteeName },
  ...team.filter((m) => !m.host).map((m) => ({ email: m.email, name: m.name })),
];

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
      location: page.type.location,
      attendees: attendeesOf(b, team),
      meet: page.type.googleMeet,
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
  location: string | null;
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
    meetingTypeName: string;
    location: string | null;
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
    meetingTypeName: r.meetingTypeName,
    location: r.location,
    personName: r.personName,
    hostName: r.hostName,
    teammates: mates
      .filter((m) => m.bookingId === rootOf(r.b))
      .map((m) => ({ id: m.id, name: m.name })),
  }));
}

const listColumns = {
  b: booking,
  meetingTypeName: meetingType.name,
  location: meetingType.location,
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
  return db
    .select({
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      inviteeName: booking.inviteeName,
      inviteeCompany: booking.inviteeCompany,
      personId: booking.personId,
      meetingTypeName: meetingType.name,
      location: sql<string | null>`coalesce(${booking.meetLink}, ${meetingType.location})`,
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
      meetingTypeName: meetingType.name,
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
  `${page.type.name}: ${b.inviteeName} and ${page.host.name}`;

function eventDescription(b: BookingRow, page: BookingPage) {
  return [
    `${page.type.name} (${page.type.durationMin} min), booked from the Lumor booking page.`,
    whereOf(b, page) ? `Where: ${whereOf(b, page)}` : "",
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
) {
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
    others: team.filter((m) => !m.host).map((m) => ({ name: m.name, email: m.email })),
    method,
    // Always increasing: the time of this booking, or of its cancellation.
    sequence: Math.floor((b.cancelledAt ?? b.createdAt).getTime() / 1000),
  } as const;
}

/** The calendar file for a booking (download on the confirmation page). */
export function bookingIcs(b: BookingRow, page: BookingPage) {
  return buildIcs(eventOf(b, page, b.status === "Cancelled" ? "CANCEL" : "REQUEST"));
}

export function bookingGoogleLink(b: BookingRow, page: BookingPage) {
  return googleCalendarLink(eventOf(b, page, "REQUEST"));
}

const inZone = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);

const manageUrl = (token: string) => `${appUrl()}/booking/${token}`;

type MailJob =
  | { kind: "booked"; booking: BookingRow; page: BookingPage; token: string }
  | {
      kind: "cancelled";
      booking: BookingRow;
      page: BookingPage;
      reason: string | null;
      by: string;
      actorId: string | null;
      team: TeamMember[];
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
  to: string,
  replyTo: string,
  content: MailContent,
  subject: string,
  ics?: string,
  cancel = false,
) {
  const { text, html } = renderMail(content);
  return sendEmail({
    to,
    replyTo,
    subject,
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

/**
 * Emails the person who booked and the rep's team. With a Google event, Google sends the
 * calendar invites, so no calendar file is attached. Never throws: the booking is saved.
 */
async function sendBookingEmails(db: Db, job: MailJob) {
  if (!emailConfigured()) return;
  const { booking: b, page } = job;
  try {
    const team = "team" in job ? job.team : await teamOf(db, b);
    const where = whereOf(b, page);
    const first = b.inviteeName.split(" ")[0];
    const fromGoogle = Boolean(b.googleEventId);
    const cancel = job.kind === "cancelled";
    const ics = fromGoogle
      ? undefined
      : buildIcs(eventOf(b, page, cancel ? "CANCEL" : "REQUEST", team));
    const meetingRows: [string, string][] = [
      ["What", `${page.type.name} (${page.type.durationMin} min)`],
      ["When", inZone(b.startsAt, b.inviteeTimeZone)],
      ["With", team.map((m) => m.name).join(", ")],
      ...(where ? ([["Where", where]] as [string, string][]) : []),
    ];

    // The person who booked.
    if (job.kind === "booked" || job.kind === "rescheduled") {
      const moved = job.kind === "rescheduled";
      await send(
        b.inviteeEmail,
        page.host.email,
        {
          heading: moved ? "Your meeting has moved" : "You're booked",
          intro: moved
            ? `Hi ${first}, your ${page.type.name} with ${page.host.name} has moved to a new time${job.actorId ? ` (changed by ${job.by})` : ""}.`
            : `Hi ${first}, your ${page.type.name} with ${page.host.name} is confirmed.`,
          rows: moved
            ? [["Was", inZone(job.old.startsAt, b.inviteeTimeZone)], ...meetingRows]
            : meetingRows,
          button: b.meetLink ? { label: "Join with Google Meet", url: b.meetLink } : undefined,
          links: [{ label: "Reschedule or cancel", url: manageUrl(job.token) }],
          foot: fromGoogle
            ? "A Google Calendar invite is on its way separately."
            : "The calendar invite is attached.",
        },
        moved
          ? `Moved: ${page.type.name} with ${page.host.name}`
          : `Confirmed: ${page.type.name} with ${page.host.name}`,
        ics,
      );
    } else {
      await send(
        b.inviteeEmail,
        page.host.email,
        {
          heading: "Your meeting is cancelled",
          intro: `Hi ${first}, your ${page.type.name} with ${page.host.name} is cancelled${job.actorId ? ` by ${job.by}` : ""}.`,
          rows: [
            ["When", inZone(b.startsAt, b.inviteeTimeZone)],
            ...(job.reason ? ([["Reason", job.reason]] as [string, string][]) : []),
          ],
          button: page.type.active
            ? { label: "Book another time", url: bookingLink(page.profile.slug, page.type.slug) }
            : undefined,
        },
        `Cancelled: ${page.type.name} with ${page.host.name}`,
        ics,
        true,
      );
    }

    // The rep and teammates (not whoever made the change).
    const actorId = "actorId" in job ? job.actorId : null;
    const heading =
      job.kind === "booked"
        ? `New booking: ${page.type.name} with ${b.inviteeName}`
        : job.kind === "cancelled"
          ? `Cancelled: ${page.type.name} with ${b.inviteeName}`
          : `Rescheduled: ${page.type.name} with ${b.inviteeName}`;
    const intro =
      job.kind === "booked"
        ? `${b.inviteeName} (${b.inviteeCompany}) booked a meeting from your link.`
        : job.kind === "cancelled"
          ? `Cancelled by ${job.by}.${job.reason ? ` Reason: ${job.reason}` : ""}`
          : `Moved from ${whenIst(job.old.startsAt)} by ${job.by}.`;
    for (const m of team.filter((x) => x.id !== actorId)) {
      await send(
        m.notifyTo,
        b.inviteeEmail,
        {
          heading,
          intro,
          rows: [
            ["When", whenIst(b.startsAt)],
            ["Who", `${b.inviteeName}, ${b.inviteeCompany} (${b.inviteeEmail})`],
            ...(b.inviteePhone ? ([["Phone", b.inviteePhone]] as [string, string][]) : []),
            ["On the meeting", teamLine(team)],
            ...(where && !cancel ? ([["Where", where]] as [string, string][]) : []),
            ...b.answers
              .filter((a) => a.answer)
              .map((a) => [a.question, a.answer] as [string, string]),
          ],
          button: { label: "Open in Lumor", url: `${appUrl()}${meetingLink(b.id)}` },
        },
        heading,
        // The host gets Google's own invite; teammates without Google get our file.
        m.host ? undefined : ics,
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
    const ics = j.b.googleEventId
      ? undefined
      : buildIcs(
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
      subject,
      ics,
      !j.added,
    );
  } catch (e) {
    console.error("Teammate email failed:", e instanceof Error ? e.message : e);
  }
}
