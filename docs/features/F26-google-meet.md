# F26: Google Calendar and Meet links

- **Priority:** P1 · **Release:** v2.6.0 · **Status:** Done
- **Decisions:** D-042, D-050, D-052, D-053

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
- **One link, open to anyone (D-050, D-052, D-053):** a meeting has exactly one Meet link, the
  same in the app, on the confirmation page, in every email and in the Google invite. The app
  sets each Meet to **Open** (Google Meet REST API, `config.accessType = OPEN`): anyone with the
  link joins straight away, at any time before or after the start, with no "Ask to join" and
  no host needed. The app reads the setting back to confirm Google kept it, and saves whether
  each meeting is open (`booking.meet_open`).
- **When a Meet can't be opened:** the meeting still works, but people who weren't invited with
  that exact Google account must ask to join, and only the host's Google account can let them
  in. The meeting window says so (with the host's Google account), and the rep gets one "Google
  Meet not open" notification with the reason in plain words (Meet REST API off, permission
  missing, or Google's answer).
- **Check Google Meet (Availability):** makes a test meeting in the rep's Google Calendar (no
  guests, no emails), opens it, checks it and deletes it, then opens every upcoming meeting of
  theirs that isn't open yet. It reports success or exactly what to fix. Reconnecting Google
  also opens the rep's upcoming meetings.
- **Failures never lose a booking:** if Google fails, the booking stands, the rep gets a "Google
  problem" notification, and the confirmation shows the meeting type's "Where" instead.
- **Invites:** with Google connected, Google sends the calendar invite, so the booking email has
  no second calendar file. Without Google, the email carries our calendar file (as in v2.5.0).

## Tests

- Automated (Google faked): booking creates an event with a Meet request and saves the link;
  reschedule moves the same event; cancel deletes it; Google busy times remove slots only when the rep switches that on (off by default since D-051); a Google
  failure keeps the booking and notifies the rep; tokens are encrypted and decrypt back.
- Automated (Google faked, D-053): a new booking's Meet is opened and saved as open; a refused or
  unconfirmed change, a switched-off Meet REST API or a missing permission each give the plain
  reason, one notification and "not open"; Check Google Meet makes, opens and deletes a test
  meeting and opens earlier upcoming meetings.
- Browser: Availability shows Connect Google Calendar (not set up message without variables);
  the meeting window shows the meeting's link as text under the Join button.

## Change history

| Date       | Version | Change                                                                                                                                                                                              |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | 2.6.0   | Feature doc written (before code), D-042.                                                                                                                                                           |
| 2026-11-02 | 2.6.0   | Built: Connect/Disconnect, encrypted token, events with Meet links, move/cancel, guests, busy times; tests with Google faked.                                                                       |
| 2026-11-02 | 2.6.0   | Released in v2.6.0.                                                                                                                                                                                 |
| 2026-11-03 | 2.7.8   | Google busy times no longer hide booking times unless the rep switches that on (D-051).                                                                                                             |
| 2026-11-03 | 2.7.9   | Each new booking's Meet is set to open (Meet REST API, new `meetings.space.settings` permission; reconnect once), so nobody waits in the lobby (D-052).                                             |
| 2026-11-04 | 2.7.10  | Plan (before code): verified Open setting, saved per meeting, shown in the meeting window with the host account; Check Google Meet; upcoming meetings opened on reconnect (D-053).                  |
| 2026-11-04 | 2.7.10  | Built and released: verified Open setting, `booking.meet_open`, meeting window status with the link as text and the host account, Check Google Meet, upcoming meetings opened on reconnect (D-053). |
