import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  BOOKING_CANCELLERS,
  BOOKING_STATUSES,
  CALENDLY_STATUSES,
  MEETING_MODES,
  type QuestionType,
  type StandardField,
} from "../enums";
import { baseColumns, flag, jsonList, oneOf, oneOfOrNull, timestamp } from "./_shared";
import { user } from "./auth";
import { person } from "./person";

// Calendar and booking links (F22): each rep's hours, their meeting types, and the bookings
// people make from the public booking pages.

/** "HH:mm" to "HH:mm" in IST. */
export type TimeRange = { start: string; end: string };
/** ISO weekday ("1" Monday … "7" Sunday) → the ranges free that day. */
export type WeeklyHours = Record<string, TimeRange[]>;
/** Older questions have no type: they read as "short" (D-042). */
export type BookingQuestion = {
  label: string;
  required: boolean;
  type?: QuestionType;
  /** For "dropdown" and "checkboxes". */
  options?: string[];
};
export type BookingAnswer = { question: string; answer: string };
/** Show/Required for each standard booking field (D-043). Missing = the defaults. */
export type StandardFields = Record<StandardField, { show: boolean; required: boolean }>;

export const calendarProfile = sqliteTable(
  "calendar_profile",
  {
    ...baseColumns(() => user.id),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "restrict" }),
    // The rep's part of the booking link: /book/{slug}/…
    slug: text("slug").notNull().unique(),
    weeklyHours: text("weekly_hours", { mode: "json" }).$type<WeeklyHours>().notNull(),
    // Plain IST dates with no bookings.
    daysOff: jsonList("days_off"),
    // Where booking emails go; empty = the rep's login email (D-042).
    notifyEmail: text("notify_email"),
    // "Co-founder, Lumor": after the rep's name in booking emails (D-043).
    emailTitle: text("email_title"),
    // Times busy in the rep's Google Calendar are taken out of their booking slots (D-047).
    useGoogleBusy: flag("use_google_busy").notNull().default(false),
  },
  (t) => [check("calendar_profile_slug_check", sql`${t.slug} GLOB '[a-z0-9]*'`)],
);

export const meetingType = sqliteTable(
  "meeting_type",
  {
    ...baseColumns(() => user.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // The meeting type's part of the booking link: /book/{rep}/{slug}
    slug: text("slug").notNull(),
    durationMin: integer("duration_min").notNull(),
    description: text("description"),
    // A meeting link, phone number or address.
    location: text("location"),
    bufferMin: integer("buffer_min").notNull().default(0),
    minNoticeHours: integer("min_notice_hours").notNull().default(0),
    maxDaysAhead: integer("max_days_ahead").notNull().default(30),
    maxPerDay: integer("max_per_day"),
    questions: jsonList<BookingQuestion>("questions"),
    active: flag("active").notNull().default(true),
    // Make a Google Meet link for each booking when the rep has Google connected (F26).
    googleMeet: flag("google_meet").notNull().default(true),
    // Round 3 (D-043): the standard fields, email wording, the in-person address, and the
    // hidden per-rep event that holds meetings a rep schedules themselves.
    standardFields: text("standard_fields", { mode: "json" }).$type<StandardFields>(),
    emailName: text("email_name"),
    emailNote: text("email_note"),
    inPersonAddress: text("in_person_address"),
    hidden: flag("hidden").notNull().default(false),
    // Deleted by the rep (D-048): gone from every list and its link stops working. Kept only
    // because past meetings point at it.
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("meeting_type_owner_slug_unique").on(t.ownerId, t.slug),
    check("meeting_type_duration_check", sql`${t.durationMin} BETWEEN 5 AND 240`),
    check("meeting_type_active_check", sql`${t.active} IN (0, 1)`),
  ],
);

export const booking = sqliteTable(
  "booking",
  {
    ...baseColumns(() => user.id),
    meetingTypeId: text("meeting_type_id")
      .notNull()
      .references(() => meetingType.id, { onDelete: "restrict" }),
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: text("status", { enum: BOOKING_STATUSES }).notNull().default("Confirmed"),
    inviteeName: text("invitee_name").notNull(),
    // Lower case.
    inviteeEmail: text("invitee_email").notNull(),
    inviteeCompany: text("invitee_company").notNull(),
    inviteePhone: text("invitee_phone"),
    inviteeLinkedin: text("invitee_linkedin"),
    inviteeNote: text("invitee_note"),
    answers: jsonList<BookingAnswer>("answers"),
    // The visitor's time zone, for their emails (e.g. "Europe/London").
    inviteeTimeZone: text("invitee_time_zone").notNull().default("Asia/Kolkata"),
    // Hash of the private code in the visitor's link (cancel, reschedule, calendar file).
    manageTokenHash: text("manage_token_hash").notNull().unique(),
    personId: text("person_id").references(() => person.id, { onDelete: "restrict" }),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: text("cancelled_by", { enum: BOOKING_CANCELLERS }),
    cancelReason: text("cancel_reason"),
    // When the visitor rescheduled: the first booking in the chain (its calendar event).
    rescheduledFromId: text("rescheduled_from_id"),
    // The event in the host's Google Calendar and its Meet link (F26). Kept across reschedules.
    googleEventId: text("google_event_id"),
    meetLink: text("meet_link"),
    // Round 3 (D-043).
    mode: text("mode", { enum: MEETING_MODES }).notNull().default("online"),
    // The private manage code, encrypted (for reminder links). Older bookings have none.
    manageTokenEnc: text("manage_token_enc"),
    reminder24At: timestamp("reminder_24_at"),
    reminder1At: timestamp("reminder_1_at"),
    // A meeting the rep scheduled themselves: its title, recipients and message.
    title: text("title"),
    toEmails: jsonList("to_emails"),
    ccEmails: jsonList("cc_emails"),
    message: text("message"),
    location: text("location"),
  },
  (t) => [
    check("booking_status_check", oneOf("status", BOOKING_STATUSES)),
    check("booking_mode_check", oneOf("mode", MEETING_MODES)),
    check("booking_cancelled_by_check", oneOfOrNull("cancelled_by", BOOKING_CANCELLERS)),
    check("booking_times_check", sql`${t.endsAt} > ${t.startsAt}`),
    // Never two confirmed bookings at the same start for one rep.
    uniqueIndex("booking_host_start_confirmed_unique")
      .on(t.hostId, t.startsAt)
      .where(sql`${t.status} = 'Confirmed'`),
    index("booking_host_starts_idx").on(t.hostId, t.startsAt),
    index("booking_person_idx").on(t.personId),
    index("booking_email_idx").on(t.inviteeEmail, t.createdAt),
  ],
);

/**
 * Teammates on a meeting (D-042). Keyed by the first booking in a reschedule chain, so they
 * stay on the meeting when it moves.
 */
export const bookingParticipant = sqliteTable(
  "booking_participant",
  {
    ...baseColumns(() => user.id),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("booking_participant_unique").on(t.bookingId, t.userId),
    index("booking_participant_user_idx").on(t.userId),
  ],
);

/** A rep's Google Calendar connection (F26). The refresh token is encrypted. */
export const googleConnection = sqliteTable("google_connection", {
  ...baseColumns(() => user.id),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "restrict" }),
  googleEmail: text("google_email").notNull(),
  // AES-256-GCM, see src/server/google/crypto.ts. Never shown or logged.
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scope: text("scope").notNull(),
  lastError: text("last_error"),
});

/** A booking made on Calendly (F27), stored once per Calendly invitee. */
export const calendlyBooking = sqliteTable(
  "calendly_booking",
  {
    ...baseColumns(() => user.id),
    // Calendly's address for the invitee: the key that makes each event count once.
    inviteeUri: text("invitee_uri").notNull().unique(),
    eventUri: text("event_uri"),
    eventName: text("event_name").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    joinUrl: text("join_url"),
    inviteeName: text("invitee_name").notNull(),
    inviteeEmail: text("invitee_email").notNull(),
    answers: jsonList<BookingAnswer>("answers"),
    status: text("status", { enum: CALENDLY_STATUSES }).notNull().default("Booked"),
    cancelReason: text("cancel_reason"),
    personId: text("person_id").references(() => person.id, { onDelete: "restrict" }),
    // The Calendly invitee this one replaced (a reschedule).
    replacesUri: text("replaces_uri"),
  },
  (t) => [
    check("calendly_booking_status_check", oneOf("status", CALENDLY_STATUSES)),
    index("calendly_booking_person_idx").on(t.personId),
  ],
);
