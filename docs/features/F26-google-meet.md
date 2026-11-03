# F26: Google Calendar and Meet links

- **Priority:** P1 · **Release:** v2.6.0 · **Status:** Done
- **Decisions:** D-042

## What it does

Each rep can connect their own Google Calendar. After that, every booking:

- creates an event in their Google Calendar with a fresh **Google Meet link**;
- invites the person who booked and the meeting's teammates (Google sends the invite);
- moves when the booking is rescheduled and is removed when it's cancelled;
- shows the Meet link on the confirmation page, in the emails, on the calendar and on Today.

The rep's Google Calendar busy times also block their booking slots, so people can't book a
time that's taken in Google.

## Rules

- **Connect:** Calendar → Availability → **Connect Google Calendar** → Google's sign-in → back
  in the app with "Connected as name@company.com". **Disconnect** revokes access and deletes
  the stored token.
- **Per meeting type:** "Create a Google Meet link for each booking" (on by default). Off, or
  not connected, uses the meeting type's "Where" text, as before.
- **Setup (owner, once):** a Google Cloud OAuth client and two variables, GOOGLE_CLIENT_ID and
  GOOGLE_CLIENT_SECRET (docs/deploy.md). Until then the Connect button explains it isn't set up.
- **Security:** the token Google returns is stored encrypted (AES-256-GCM), only on the server,
  never shown. The sign-in is protected by a one-time state code in a cookie. Each connection
  and disconnection is audited (without the token).
- **Scopes:** `calendar.events`, `calendar.freebusy` and (from 2.7.9, D-052) `meetings.space.settings`, used to make each new booking's Meet open.
- **Busy times:** checked when the booking page loads and again when booking. If Google can't
  be reached, slots use only the app's bookings.
- **Failures never lose a booking:** if Google fails, the booking stands, the rep gets a "Google
  problem" notification, and the confirmation shows the meeting type's "Where" instead.
- **Invites:** with Google connected, Google sends the calendar invite, so the booking email has
  no second calendar file. Without Google, the email carries our calendar file (as in v2.5.0).

## Tests

- Automated (Google faked): booking creates an event with a Meet request and saves the link;
  reschedule moves the same event; cancel deletes it; Google busy times remove slots only when the rep switches that on (off by default since D-051); a Google
  failure keeps the booking and notifies the rep; tokens are encrypted and decrypt back.
- Browser: Availability shows Connect Google Calendar (not set up message without variables).

## Change history

| Date       | Version | Change                                                                                                                                                  |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | 2.6.0   | Feature doc written (before code), D-042.                                                                                                               |
| 2026-11-02 | 2.6.0   | Built: Connect/Disconnect, encrypted token, events with Meet links, move/cancel, guests, busy times; tests with Google faked.                           |
| 2026-11-02 | 2.6.0   | Released in v2.6.0.                                                                                                                                     |
| 2026-11-03 | 2.7.8   | Google busy times no longer hide booking times unless the rep switches that on (D-051).                                                                 |
| 2026-11-03 | 2.7.9   | Each new booking's Meet is set to open (Meet REST API, new `meetings.space.settings` permission; reconnect once), so nobody waits in the lobby (D-052). |
