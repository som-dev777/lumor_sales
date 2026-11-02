# F25: Notifications

- **Priority:** P1 · **Release:** v2.6.0 · **Status:** Done
- **Decisions:** D-042

## What it does

A bell in the sidebar shows how many new notifications a rep has. Notifications tell a rep
about their meetings: a new booking, a cancellation, a reschedule, and being added to (or
removed from) someone else's meeting. Each one is also emailed to the rep's notification
address (set on Calendar → Availability).

## Rules

- **Who gets one:** the meeting's host and every teammate on it, except the person who made the
  change.
- **Kinds:** New booking · Cancelled · Rescheduled · Added to a meeting · Removed from a
  meeting · Google problem (the Meet link or calendar event couldn't be made).
- **Each shows:** what happened, the meeting, the time in IST, who did it, who's on the
  meeting, and a link to the meeting on the calendar.
- **Unread count:** on the bell and on **Calendar** in the sidebar; checked again every minute
  while the page is open.
- **Mark all read:** opening the bell's list offers **Mark all read**; clicking a notification
  marks it read. Each mark is a change: requireUser → own notifications only → update +
  audit in one transaction (one audit entry per click).
- **Private:** a rep only ever sees their own notifications, Admins included.
- **Email:** sent to the rep's notification email (defaults to their login email) when email
  is set up (Resend). Never blocks the booking: a failed email is logged.
- **Kept:** the latest 50 show in the list.

## Screens

- **Sidebar:** a bell button with the unread count, above the menu; **Calendar** shows the
  same count.
- **Notifications panel:** newest first, unread in bold, each linking to the meeting.

## Tests

- Automated: a booking notifies the host (not the visitor), a teammate added is notified, a
  cancel notifies host and teammates but not the person who cancelled, mark read only touches
  your own and is audited.
- Browser: after a visitor books, the rep's bell shows 1; opening it shows the booking.

## Change history

| Date       | Version | Change                                                                          |
| ---------- | ------- | ------------------------------------------------------------------------------- |
| 2026-11-02 | 2.6.0   | Feature doc written (before code), D-042.                                       |
| 2026-11-02 | 2.6.0   | Built: notification table, bell with count, mark read (audited), emails; tests. |
| 2026-11-02 | 2.6.0   | Released in v2.6.0.                                                             |
