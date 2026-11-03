# F22: Calendar and booking links

- **Priority:** P1 · **Release:** v2.5.0, round 2 in v2.6.0 · **Status:** Done (round 3 in 2.7.0)
- **Decisions:** D-041 (the owner's requests of 2026-11-02), D-042 (round 2)

## What it does

Each rep has a calendar in the app. They create **meeting types** (for example "Lumor demo,
30 min"), set the hours they're free, and share a **booking link** for each meeting type,
usually in a message to a prospect. Anyone who opens the link, no account needed, sees the free
slots in their own time zone and books one. It works like Calendly, inside the Sales Hub, and the
booking updates the sales records.

## Round 2 (v2.6.0, D-042)

These rules replace the matching v2.5.0 rules below where they differ.

- **Questions:** up to 10 per meeting type, each Short answer, Paragraph, Dropdown (pick one)
  or Checkboxes (pick any), optional or required. Dropdowns and checkboxes have 2–20 options.
  The booking form shows only these questions plus name, work email, company, phone (optional)
  and LinkedIn (optional): the old free-text note is gone. Required fields show a red star.
- **Length:** 15, 20, 30, 45, 60, 90 or 120 minutes, or Custom (5–240, steps of 5).
- **Availability:** up to 12 time ranges a day. The Availability page shows **What people
  see**: the next free times for each active meeting type, and warns when a meeting type is
  longer than every range on a day. **Notification email:** where booking emails go (defaults
  to the login email).
- **Booking form checks:** email needs a real domain with a dot; phone, when given, needs a
  country (flag dropdown, India first) and must be a valid number for it.
- **Time zone:** the booking page starts in India Standard Time (IST), with a dropdown of every
  time zone, and "Use my time zone" when the visitor's browser is elsewhere.
- **Public pages:** a wrong or changed booking address shows a plain "This link doesn't work"
  page with no way into the app. Footer: "Lumor".
- **Booking page layout:** meeting details on the left, a month calendar of free days and the
  day's times on the right; one column on phones; a clear confirmation with the meeting link.
- **Calendar:** month, week and day views (and a List view) in IST, with back/next/today.
  Everyone sees every rep's meetings (filter Everyone / Just me / one rep). Clicking a meeting
  opens its details: who booked, answers, the meeting link, the people on it, and actions.
- **Teammates:** the host, a teammate on the meeting or an Admin can add or remove other reps.
  Teammates get a notification (F25) and an email with the invite; their meetings block their
  own booking pages. A warning shows when the teammate is busy then.
- **Rep reschedule:** the host or an Admin can move a meeting to another free time from its
  details; the person who booked is emailed the new time and a new manage link.
- **Notifications:** new bookings, cancellations, reschedules and teammate changes notify the
  host and teammates (F25) and email their notification address.
- **Google Meet:** with Google Calendar connected (F26), each booking gets its own Meet link.
- **Today:** Meetings today includes meetings you've been added to.

## Rules

### Meeting types

- **Fields:** name; link name (the end of the booking link, for example `demo`); length (15,
  20, 30, 45, 60 or 90 minutes); description; where (a Google Meet, Zoom or other meeting link,
  or a phone or address); gap after each meeting (0–60 minutes); minimum notice (0–72 hours; 0 by default, so people can book the same day, D-051);
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

## Round 3 (v2.7.0, D-043)

- **Events:** "Meeting types" are now **Events** (Calendar → Events, **New event**). The old
  address forwards.
- **Booking form:** each event lists the standard fields first, in this order: **Work email**
  and **Your name** (always shown, always required), **Company**, **Phone**, **LinkedIn
  profile**, **How would you like to meet?** (Online / In person). Each of the last four has
  Show and Required switches. Then the event's own questions (up to 10). No "* Required" line;
  required fields keep their red star.
- **Online or in person:** online = Google Meet (or the event's link); in person = the event's
  **In-person address** (or "we'll confirm the place"). No Meet link for in-person meetings.
- **Email fields:** **Name in emails** and **Note in emails** on the event; **Your title in
  emails** on Availability. The emails use the owner's copy (docs/email-templates/).
- **Reminders:** 24 hours and 1 hour before, to the person who booked, by the 15-minute
  scheduled job; each with **Choose a new time**. Each is sent once; none for cancelled
  meetings.
- **Choices:** matched ignoring spaces, case and accents; an unknown choice is dropped instead
  of refusing the booking (fixes the required-checkbox error).
- **Phone:** the closed country box shows "🇮🇳 IN +91".
- **Logo:** the owner's Lumor logo on every public page and in the emails.
- **Confirmation page:** success message, details, Join button, and only **Reschedule** and
  **Cancel**.
- **Sync to the person:** found by email, then name + company, then LinkedIn. Found: Meeting
  booked (date, link, answers), Meeting scheduled, plan paused, on Today. Not found: a new person
  owned by the event's rep, flagged **Check details**. Cancelled: stage back to Replied, plan
  resumed. Rescheduled: Meeting moved. The rep's email follows the owner's copy with **Open in
  Sales Hub**.
- **Calendar page:** the person filter lists reps only, starts on the signed-in rep, and lines up
  with the view buttons.
- **Schedule a meeting:** reps add a meeting themselves: title, date, time, length, how to meet
  (Google Meet, in person, phone, another link), place or link, **To** and **CC** addresses and a
  message. Emailed to To with CC copied; Google invites everyone when connected. It behaves like
  any other meeting (teammates, reschedule, cancel).

### Tests (round 3)

- Automated: the standard fields' Show/Required rules; email always required; in-person
  bookings have no Meet link; choice matching and dropped unknown choices; reminders due at 24 h
  and 1 h, once each, skipped when booked late or cancelled; sync (found, not found, cancel,
  reschedule); a scheduled meeting with To and CC; the calendar filter's default.
- Browser: create an event with a required checkbox question and book it on a phone; "IN +91"
  shows; the confirmation page offers only Reschedule and Cancel; schedule a meeting with To and
  CC.

## Change history

| Date       | Version | Change                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | 2.5.0   | Feature doc written (before code).                                                                                                                                                                                                                                                                                        |
| 2026-11-02 | 2.5.0   | Built: tables (migration 0012), slot rules, invites, public booking pages, Calendar pages, Today and person page; tests.                                                                                                                                                                                                  |
| 2026-11-02 | 2.5.0   | Released in v2.5.0.                                                                                                                                                                                                                                                                                                       |
| 2026-11-02 | 2.6.0   | Round 2 rules written (before code), D-042.                                                                                                                                                                                                                                                                               |
| 2026-11-02 | 2.6.0   | Built round 2: migration 0013, question types, custom length, 12 ranges, preview, notification email, stricter form, public not-found, month/week/day calendar, teammates, rep reschedule; tests.                                                                                                                         |
| 2026-11-02 | 2.6.0   | Round 2 released in v2.6.0.                                                                                                                                                                                                                                                                                               |
| 2026-11-03 | 2.7.0   | Round 3 written (D-043), before code: events, booking form fields, online or in person, reminders, the owner's email copy, sync to the person, Schedule a meeting, calendar filter.                                                                                                                                       |
| 2026-11-03 | 2.7.0   | Round 3 built: Events, booking form switches, online or in person, the owner's emails and reminders (with the 15-minute job), booking sync to the person (also creates people without LinkedIn, flagged Check details), Schedule a meeting with To and CC, one-rep calendar filter, logo, "IN +91", the checkbox fix.     |
| 2026-11-03 | 2.7.0   | Released in v2.7.0 (D-043).                                                                                                                                                                                                                                                                                               |
| 2026-11-03 | 2.7.2   | Random link code for new events, Why some times are missing on Availability, red unavailable days, guests by email, instant pop-up close, one-line short meetings, Calendar badge = today's meetings (D-045).                                                                                                             |
| 2026-11-03 | 2.7.4   | Google no longer emails guests (Lumor's emails carry the invite); subjects start with the event title; booking page in steps (introduction, day and time with time zone on top, details); overlap re-check; every missing time with its reason; Google busy switch; new events have no gap; Send me a test email (D-047). |
| 2026-11-03 | 2.7.5   | No gaps; free-times count and greyed taken times; black unavailable dates; delete events; Online/Offline labels and Go online/offline (D-048).                                                                                                                                                                            |
| 2026-11-03 | 2.7.6   | Google sends its invite when the app can't email, so the booker always hears; 11:00 traced to Google busy times (D-049).                                                                                                                                                                                                  |
| 2026-11-03 | 2.7.7   | One meeting, one Meet link: the event's own link is never used for a Google Meet meeting; the app waits for Google's link (D-050).                                                                                                                                                                                        |
| 2026-11-03 | 2.7.8   | Meetings always open after closing or cancelling one; same-day booking (no notice by default); Google busy times no longer hide slots; dates line up under weekdays (D-051).                                                                                                                                              |
