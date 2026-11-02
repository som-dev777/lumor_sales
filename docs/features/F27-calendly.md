# F27: Calendly integration

- **Priority:** P1 · **Release:** v2.7.0 · **Status:** Planned
- **PRD:** [Version 2.7 additions](../PRD.md#version-27-additions-owner-2026-11-03)
- **Decisions:** D-043

## What it does

When someone books, cancels or reschedules a meeting on Calendly, Calendly tells the Sales Hub
(a "webhook"). The Sales Hub then updates the person the same way as a booking from its own
booking page (F22): it logs the meeting, moves the stage, pauses or resumes their plan, puts the
meeting on Today and emails the person's owner.

## The webhook

- **Address:** `POST /api/calendly/webhook` (no login).
- **Events:** `invitee.created` and `invitee.canceled`. Anything else is ignored (answered 200).
- **Signature check:** Calendly signs each call with the webhook's signing key. The app
  recomputes HMAC-SHA256 of `{t}.{body}` with `CALENDLY_WEBHOOK_SIGNING_KEY` (in `.env.local`
  and on Netlify) and compares it in constant time. A wrong or missing signature, or one older
  than 5 minutes, is refused (401). Without the key set, the address is closed (401).
- **Once only:** each Calendly invitee is stored with its Calendly address (`invitee` URI), so a
  repeated call changes nothing.

## On a booking (`invitee.created`)

1. **Find the person:** by email (any letter case); otherwise by name + company (both
   ignoring case and extra spaces).
2. **Found:**
   - log **Meeting booked** on their timeline (as their owner) with the date and time, the
     meeting link and the answers to the booking questions;
   - stage → **Meeting scheduled**; next action **Hold meeting** on the meeting date, so it
     shows on Today that day;
   - **pause** their plan (if they're on one).
3. **Not found:** create a person owned by the **default Admin** (the earliest Admin still
   active), with the name, email, company and phone from the booking, stage Meeting scheduled,
   and the flag **"From Calendly: check details"** on their page. Then log Meeting booked as
   above.
4. **Company:** the answer to a booking question that mentions "company" or "organisation";
   otherwise the email's domain (acme.com), except free email services (gmail.com…), which give
   "Not given".
5. **Email** the person's owner (owner's copy, docs/email-templates/calendly.md, section 1), with
   one button: **Open in Sales Hub**, to the person's page.

## On a cancellation (`invitee.canceled`)

- **Marked "rescheduled" by Calendly:** nothing yet. The new booking that follows says which
  booking it replaces (`old_invitee`), and is handled as a move (below).
- **Otherwise:** log **Meeting cancelled** with the reason ("None given" when empty); stage →
  **Replied**; next action Respond, today; **resume** their plan if it was paused. Email the
  owner (section 2).

## On a reschedule

A new booking pointing at an earlier one (`old_invitee`) is one **Meeting moved** note ("from
… to …"), and Today's meeting date moves. The stage stays Meeting scheduled and the plan stays
paused. The owner gets the "moved" email (section 3).

## Audit

Every change (person created, activity logged, stage moved, plan paused or resumed, the
Calendly booking stored) writes an audit entry in the same transaction, by the person's owner
(or the default Admin for a new person), noted "via Calendly".

## Data

- `calendly_booking`: Calendly invitee URI (unique), event URI, event name, start and end, the
  meeting link, invitee name and email, answers, status (Booked, Cancelled, Moved), cancel
  reason, the person, and the booking it replaced.

## Setting it up (owner)

Steps in docs/deploy.md ("Calendly"): needs a paid Calendly plan (webhooks), a personal access
token to create the webhook subscription, and the signing key you choose, added on Netlify as
`CALENDLY_WEBHOOK_SIGNING_KEY`.

## Tests

- Automated: signature (good, wrong, old, missing key); a matched booking (activity, stage,
  plan paused, Today, email); an unmatched booking (new person, owner, flag); a cancellation
  (Replied, plan resumed, reason); a reschedule (one Meeting moved, date moved, no cancel
  logged); a repeated call changes nothing; audit entries.

## Change history

| Date       | Version | Change                            |
| ---------- | ------- | --------------------------------- |
| 2026-11-03 | 2.7.0   | Doc written (D-043), before code. |
