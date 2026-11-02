// Calendar and booking links (F22). Reps set their hours and meeting types (signed in, checked
// with calendar.manage and audited). Visitors book from the public pages without signing in:
// each of those changes is checked against the booking link or the booking's private code
// instead, and audited with the rep as the actor (D-041).
import { and, asc, desc, eq, gt, gte, lt, ne, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { activity, booking, calendarProfile, meetingType, person, user } from "@/lib/db/schema";
import { buildIcs, googleCalendarLink } from "@/lib/ics";
import { normaliseLinkedInUrl } from "@/lib/linkedin";
import { assertCan, can, type Actor } from "@/lib/permissions";
import { availableSlots, DEFAULT_HOURS, isOffered, type Busy, type WeeklyHours } from "@/lib/slots";
import { formatIst, istDayRange, istMidnight, toIstDate, todayIst } from "@/lib/time";
import { appUrl, generateToken, hashToken } from "@/lib/tokens";
import type { AvailabilityData, BookingFormData, MeetingTypeData } from "@/lib/validation/calendar";
import { toSlug } from "@/lib/validation/calendar";
import { personSchema } from "@/lib/validation/leads";
import { emailConfigured, sendEmail } from "./email";
import { LeadError } from "./leads/companies";
import { createPersonTx, loadPerson } from "./leads/people";
import { quickLogTx } from "./leads/quicklog";

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
    return { slug: row.slug, weeklyHours: row.weeklyHours, daysOff: row.daysOff, saved: true };
  }
  return {
    slug: await freeProfileSlug(db, toSlug(owner.name.split(" ")[0], "rep")),
    weeklyHours: DEFAULT_HOURS,
    daysOff: [],
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
      .set({ slug: data.slug, weeklyHours, daysOff })
      .where(eq(calendarProfile.id, before.id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Calendar",
      recordId: after.id,
      recordName: `${owner.name}'s calendar`,
      action: "Updated",
      before: { slug: before.slug, weeklyHours: before.weeklyHours, daysOff: before.daysOff },
      after: { slug: after.slug, weeklyHours: after.weeklyHours, daysOff: after.daysOff },
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

/** The rep's confirmed bookings that end after `from`, each with its own gap. */
async function busyFor(db: DbOrTx, hostId: string, from: Date, exceptId?: string): Promise<Busy[]> {
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
        eq(booking.hostId, hostId),
        eq(booking.status, "Confirmed"),
        gt(booking.endsAt, new Date(from.getTime() - 24 * 3600_000)),
        exceptId ? ne(booking.id, exceptId) : undefined,
      ),
    );
  return rows;
}

const slotArgs = (page: BookingPage, busy: Busy[], now: Date) => ({
  hours: page.profile.weeklyHours,
  daysOff: page.profile.daysOff,
  rules: page.type,
  busy,
  meetingTypeId: page.type.id,
  now,
});

/** The free start times on a booking page. */
export async function freeSlots(
  db: DbOrTx,
  page: BookingPage,
  now = new Date(),
  exceptId?: string,
) {
  if (!page.type.active) return [];
  return availableSlots(slotArgs(page, await busyFor(db, page.host.id, now, exceptId), now));
}

// --- Booking, cancelling, rescheduling -------------------------------------------------------

type Notice = {
  kind: "booked" | "cancelled";
  booking: BookingRow;
  page: BookingPage;
  reason?: string | null;
};

const TAKEN = "That time was just taken. Pick another.";

/**
 * Books a slot from a public page. Checks the slot again inside the transaction (and the
 * database refuses two confirmed bookings at the same start). Links the booking to a person.
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
      return insertBooking(tx, page, input, token, now, null);
    });
  } catch (e) {
    throw takenOr(e);
  }
  await notify({ kind: "booked", booking: saved, page });
  return { booking: saved, token };
}

function takenOr(e: unknown) {
  if (e instanceof LeadError) return e;
  const text =
    String((e as { message?: string })?.message ?? e) +
    String((e as { cause?: unknown })?.cause ?? "");
  return /UNIQUE/i.test(text) && /booking/i.test(text) ? new LeadError(TAKEN) : e;
}

async function insertBooking(
  tx: DbOrTx,
  page: BookingPage,
  input: BookingFormData,
  token: string,
  now: Date,
  replacing: BookingRow | null,
) {
  const start = new Date(input.startsAt);
  const busy = await busyFor(tx, page.host.id, now);
  if (!isOffered(start, slotArgs(page, busy, now))) throw new LeadError(TAKEN);
  const end = new Date(start.getTime() + page.type.durationMin * 60_000);
  const answers = page.type.questions.map((q, i) => ({
    question: q.label,
    answer: input.answers[i]?.trim() ?? "",
  }));
  const missing = page.type.questions.find((q, i) => q.required && !answers[i].answer);
  if (missing) throw new LeadError(`Answer "${missing.label}".`);
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
      inviteeNote: input.note,
      answers,
      inviteeTimeZone: input.timeZone,
      manageTokenHash: hashToken(token),
      personId: replacing?.personId ?? null,
      // The first booking in the chain, so every invite updates the same calendar event.
      rescheduledFromId: replacing ? (replacing.rescheduledFromId ?? replacing.id) : null,
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
      via: "Booking page",
    },
  });
  const when = `${formatIst(start, "EEE d MMM yyyy, h:mm aaa")} IST`;
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
      b.inviteeNote ? `Their note: ${b.inviteeNote}` : "",
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
      after: { nextActionDate: date, via: "Booking page" },
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
  const after = await db.transaction(async (tx) => {
    const row = await cancelTx(tx, b, page, "invitee", page.host.id, reason, now);
    if (b.personId) {
      await noteOnPerson(
        tx,
        page.host.id,
        b.personId,
        cancelledNote(page, b, b.inviteeName, reason),
      );
    }
    return row;
  });
  await notify({ kind: "cancelled", booking: after, page, reason });
  return after;
}

/** The rep (or an Admin) cancels from Calendar → Bookings. */
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
  const after = await db.transaction(async (tx) => {
    const row = await cancelTx(tx, b, page, "host", actor.id, reason, now);
    if (b.personId) {
      await noteOnPerson(tx, actor.id, b.personId, cancelledNote(page, b, page.host.name, reason));
    }
    return row;
  });
  await notify({ kind: "cancelled", booking: after, page, reason });
  return after;
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
  const { booking: old, page } = found;
  if (old.status !== "Confirmed") throw new LeadError("This booking is already cancelled.");
  if (old.startsAt <= now) throw new LeadError("This meeting has already started.");
  if (!page.type.active) throw new LeadError("This booking link isn't taking bookings.");
  const fresh = generateToken();
  let saved: BookingRow;
  try {
    saved = await db.transaction(async (tx) => {
      await cancelTx(tx, old, page, "invitee", page.host.id, "Rescheduled", now);
      return insertBooking(
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
          answers: old.answers.map((a) => a.answer),
          timeZone: old.inviteeTimeZone,
        },
        fresh,
        now,
        old,
      );
    });
  } catch (e) {
    throw takenOr(e);
  }
  await notify({
    kind: "cancelled",
    booking: { ...old, status: "Cancelled" },
    page,
    reason: "Rescheduled",
    quiet: true,
  });
  await notify({ kind: "booked", booking: saved, page });
  return { booking: saved, token: fresh };
}

// --- Lists -----------------------------------------------------------------------------------

export type BookingListRow = BookingRow & {
  meetingTypeName: string;
  personName: string | null;
  hostName: string;
};

/** The rep's bookings: upcoming (soonest first) or past (latest first). */
export async function listBookings(
  db: DbOrTx,
  hostId: string,
  when: "upcoming" | "past",
  now = new Date(),
  limit = 200,
): Promise<BookingListRow[]> {
  const rows = await db
    .select({
      b: booking,
      meetingTypeName: meetingType.name,
      personName: person.fullName,
      hostName: user.name,
    })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .innerJoin(user, eq(user.id, booking.hostId))
    .leftJoin(person, eq(person.id, booking.personId))
    .where(
      and(
        eq(booking.hostId, hostId),
        when === "upcoming" ? gt(booking.endsAt, now) : lt(booking.endsAt, now),
      ),
    )
    .orderBy(when === "upcoming" ? asc(booking.startsAt) : desc(booking.startsAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.b,
    meetingTypeName: r.meetingTypeName,
    personName: r.personName,
    hostName: r.hostName,
  }));
}

/** The rep's confirmed meetings today (IST), for Today. */
export async function meetingsToday(db: DbOrTx, hostId: string, now = new Date()) {
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
      location: meetingType.location,
    })
    .from(booking)
    .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
    .where(
      and(
        eq(booking.hostId, hostId),
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
    .where(eq(booking.personId, personId))
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
          eq(booking.hostId, actor.id),
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

// --- Emails ----------------------------------------------------------------------------------

function eventOf(b: BookingRow, page: BookingPage, method: "REQUEST" | "CANCEL") {
  return {
    // A rescheduled booking keeps its first booking's id, so calendars move the same event.
    uid: `${b.rescheduledFromId ?? b.id}@lumor-sales-hub`,
    start: b.startsAt,
    end: b.endsAt,
    title: `${page.type.name}: ${b.inviteeName} and ${page.host.name}`,
    description: [
      `${page.type.name} (${page.type.durationMin} min), booked from the Lumor booking page.`,
      page.type.location ? `Where: ${page.type.location}` : "",
      `${b.inviteeName}, ${b.inviteeCompany} (${b.inviteeEmail})`,
      b.inviteeNote ? `Note: ${b.inviteeNote}` : "",
      ...b.answers.filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`),
    ]
      .filter(Boolean)
      .join("\n"),
    location: page.type.location,
    organizer: { name: page.host.name, email: page.host.email },
    attendee: { name: b.inviteeName, email: b.inviteeEmail },
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
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);

/** Emails both sides (when email is set up). Never throws: the booking is already saved. */
async function notify(n: Notice & { quiet?: boolean }) {
  if (!emailConfigured() || n.quiet) return;
  const { booking: b, page } = n;
  const cancelled = n.kind === "cancelled";
  const ics = buildIcs(eventOf(b, page, cancelled ? "CANCEL" : "REQUEST"));
  const attachments = [
    {
      filename: cancelled ? "cancel.ics" : "invite.ics",
      content: ics,
      contentType: "text/calendar; method=" + (cancelled ? "CANCEL" : "REQUEST"),
    },
  ];
  const where = page.type.location ? `\nWhere: ${page.type.location}` : "";
  const sign = "\n\n— Lumor";
  try {
    await sendEmail({
      to: b.inviteeEmail,
      replyTo: page.host.email,
      subject: cancelled
        ? `Cancelled: ${page.type.name} with ${page.host.name}`
        : `Confirmed: ${page.type.name} with ${page.host.name}`,
      text: cancelled
        ? `Hi ${b.inviteeName.split(" ")[0]},\n\nYour ${page.type.name} with ${page.host.name} on ${inZone(b.startsAt, b.inviteeTimeZone)} is cancelled.${n.reason && n.reason !== "Rescheduled" ? `\nReason: ${n.reason}` : ""}\n\nBook another time: ${bookingLink(page.profile.slug, page.type.slug)}${sign}`
        : `Hi ${b.inviteeName.split(" ")[0]},\n\nYour ${page.type.name} (${page.type.durationMin} min) with ${page.host.name} is booked for ${inZone(b.startsAt, b.inviteeTimeZone)}.${where}\n\nThe calendar invite is attached.\n\nNeed to change it? Reschedule or cancel from the link on your confirmation page.${sign}`,
      attachments,
    });
    await sendEmail({
      to: page.host.email,
      replyTo: b.inviteeEmail,
      subject: cancelled
        ? `Cancelled: ${page.type.name} with ${b.inviteeName}`
        : `New booking: ${page.type.name} with ${b.inviteeName}`,
      text: `${b.inviteeName} (${b.inviteeCompany}, ${b.inviteeEmail}) ${cancelled ? "cancelled" : "booked"} ${page.type.name} on ${formatIst(b.startsAt, "EEE d MMM yyyy, h:mm aaa")} IST.${n.reason ? `\nReason: ${n.reason}` : ""}${b.inviteeNote && !cancelled ? `\nTheir note: ${b.inviteeNote}` : ""}\n\nSee it in Lumor Sales Hub: ${appUrl()}/calendar`,
      attachments,
    });
  } catch (e) {
    console.error("Booking email failed:", e instanceof Error ? e.message : e);
  }
}
