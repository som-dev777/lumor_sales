# F22: Calendar and booking links

- **Priority:** P1 · **Release:** v2.5.0 · **Status:** Done
- **Decisions:** D-041 (the owner's requests of 2026-11-02)

## What it does

Each rep has a calendar in the app. They create **meeting types** (for example "Lumor demo,
30 min"), set the hours they're free, and share a **booking link** for each meeting type,
usually in a message to a prospect. Anyone who opens the link, no account needed, sees the free
slots in their own time zone and books one. It works like Calendly, inside the Sales Hub, and the
booking updates the sales records.

## Rules

### Meeting types

- **Fields:** name; link name (the end of the booking link, for example `demo`); length (15,
  20, 30, 45, 60 or 90 minutes); description; where (a Google Meet, Zoom or other meeting link,
  or a phone or address); gap after each meeting (0–60 minutes); minimum notice (0–72 hours);
  how far ahead people can book (1–90 days); an optional limit per day; extra questions (up to 5,
  each optional or required). Name, work email and company are always asked; phone and LinkedIn
  profile are optional fields on every booking form.
- **On / off:** a meeting type that's off keeps its link, but the page says it isn't taking
  bookings.
- **Who:** every rep manages their own (`calendar.manage`, own records only); Admins can manage
  anyone's. Each change is audited.

### Availability

- **Weekly hours in India time:** for each weekday, no hours or one or more time ranges (for
  example 10:00–13:00 and 14:00–18:00, which leaves a lunch break).
- **Days off:** specific dates with no bookings.
- **Default:** Monday to Friday, 10:00–18:00 IST, created the first time a rep opens Calendar.
- **Booking page name:** each rep has a link name (for example `somnath`), made from their name,
  unique, and editable.

### Slots

- Slots start every 15 minutes for meetings up to 20 minutes long, otherwise every 30 minutes,
  from the start of each time range. A slot must fit entirely inside one range.
- A slot is offered only when:
  - it starts at least the minimum notice from now;
  - its day is within "how far ahead" (counted in IST days from today);
  - it doesn't overlap any confirmed booking of the same rep (any meeting type), with each
    side's gap after it;
  - the day isn't a day off;
  - the meeting type's per-day limit isn't reached.
- **Double bookings are refused on the server:** the slot is checked again inside the saving
  transaction, and the database refuses two confirmed bookings for the same rep at the same
  start time.

### Booking

- **The public page** `/book/{rep}/{meeting type}` shows the rep's name, the meeting type, its
  length, where it happens and its description; then the days with free slots, and the times in
  the visitor's time zone (detected by the browser, with a dropdown to change it).
- **The form:** name, work email, company, phone (optional), LinkedIn profile (optional), the
  meeting type's questions, and a note. A hidden spam trap field refuses robots.
- **At most 3 bookings per email address per day**, across all meeting types.
- **After booking:** a confirmation page with the details, **Add to calendar** (Google Calendar
  link and a calendar file for Outlook and Apple), and links to reschedule or cancel. The same
  page is reached later from the email (`/booking/{private code}`).
- **Emails (when email is set up):** the person who booked and the rep each get a confirmation
  with the calendar invite attached; cancellations send a cancellation that removes it from
  calendars. Without email, the confirmation page still offers the calendar file, and the rep
  sees the booking in the app.

### Linking the booking to a person

- The app looks for the person by **email**, then by **LinkedIn profile**.
- **Found:** the booking is linked to them. If the rep can edit that lead (owner or Admin), the
  app logs **Meeting booked** with the meeting date (stage moves to **Meeting scheduled**, next
  action "Hold meeting" on that date, so it shows on Today) and adds the booking details as a
  note.
- **Not found, with a LinkedIn profile:** the app adds the person (owned by the rep, company
  created if new, email and phone filled in) and logs Meeting booked.
- **Not found, without a LinkedIn profile:** the booking isn't linked; the rep sees **Add as
  person** on the booking, which opens the Add person form filled in from the booking.
- Every person found or added is audited, with the rep as the actor and "via booking page".

### Cancel and reschedule

- **The person who booked:** from the confirmation page or email, until the start time.
  Rescheduling picks a new free slot; the old booking is cancelled and the new one keeps a link
  to it.
- **The rep or an Admin:** from Calendar → Bookings, with an optional reason that goes in the
  cancellation email.
- A linked person gets a note in their conversation for each cancellation and reschedule. A
  reschedule moves their "Hold meeting" date to the new date.

### Public access (D-041)

- `/book/…` and `/booking/…` open without signing in. These are the only data changes made
  without a signed-in user: each one is checked against the booking link or the private code
  instead, and audited with the rep as the actor.

## Screens

- **Sidebar:** **Calendar**, second after Today.
- **Calendar → Bookings:** upcoming and past bookings (time in IST, meeting type, who, company,
  answers, linked person or **Add as person**), Cancel.
- **Calendar → Meeting types:** each type with its booking link, **Copy link**, **Open**, On/Off,
  Edit, and **New meeting type**.
- **Calendar → Availability:** weekly hours, days off, and the booking page name.
- **Person page:** a **Booking links** list (the rep's meeting types with **Copy link**), and
  the person's upcoming bookings.
- **Today:** **Meetings today** from the calendar, with times, at the top of the list.
- **AI:** the AI uses the rep's first meeting type link as the calendar link it offers
  prospects (falling back to the one on AI Resources).

## Tests

- Automated: slot rules (ranges, step, minimum notice, how far ahead, gaps, overlaps across
  meeting types, days off, per-day limit, IST day edges); double booking refused; booking links
  to an existing person by email and logs Meeting booked; a new person is added only with a
  LinkedIn profile; cancel and reschedule (with notes and the moved date); 3 bookings per email
  per day; only the owner or an Admin edits meeting types and cancels; calendar file contents.
- Browser: a rep sets hours, creates a meeting type and copies its link; a visitor (signed out)
  books a slot and sees the confirmation; the slot disappears; the booking appears in Calendar
  and on the linked person; the visitor cancels.

## Change history

| Date       | Version | Change                                                                                                                   |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-02 | 2.5.0   | Feature doc written (before code).                                                                                       |
| 2026-11-02 | 2.5.0   | Built: tables (migration 0012), slot rules, invites, public booking pages, Calendar pages, Today and person page; tests. |
| 2026-11-02 | 2.5.0   | Released in v2.5.0.                                                                                                      |
