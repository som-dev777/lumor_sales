import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { BOOKING_CANCELLERS, BOOKING_STATUSES } from "../enums";
import { baseColumns, flag, jsonList, oneOf, oneOfOrNull, timestamp } from "./_shared";
import { user } from "./auth";
import { person } from "./person";

// Calendar and booking links (F22): each rep's hours, their meeting types, and the bookings
// people make from the public booking pages.

/** "HH:mm" to "HH:mm" in IST. */
export type TimeRange = { start: string; end: string };
/** ISO weekday ("1" Monday … "7" Sunday) → the ranges free that day. */
export type WeeklyHours = Record<string, TimeRange[]>;
export type BookingQuestion = { label: string; required: boolean };
export type BookingAnswer = { question: string; answer: string };

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
    minNoticeHours: integer("min_notice_hours").notNull().default(4),
    maxDaysAhead: integer("max_days_ahead").notNull().default(30),
    maxPerDay: integer("max_per_day"),
    questions: jsonList<BookingQuestion>("questions"),
    active: flag("active").notNull().default(true),
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
  },
  (t) => [
    check("booking_status_check", oneOf("status", BOOKING_STATUSES)),
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
