# F17: Plans

- **Priority:** P0 · **Release:** R7 (v2.0.0) · **Status:** In progress
- **PRD:** [Version 2 scope → F17 Plans; Cadence guardrails](../PRD.md#version-2-scope-r7r9)
- **Decisions:** D-030 (guardrails), D-031 (scheduling), D-033 (owner's answers), D-034 (build choices)

## What it does

A plan is the agreed way to pitch a person: an ordered list of steps, each with a channel, a
message or call script, and a wait. Each enrolled person has exactly one next step with a due
date, and Today lists those steps. Plans replace F15's fixed sequence and the follow-up
delays that used to be in Playbook Settings.

## Plans and steps

- **Plan:** name, type (Outreach, Meeting follow-up, Trial, Onboarding), persona (optional),
  Official or Personal, owner, status (Active / Archived), version, **Skip weekends** (on by
  default).
- **Step:** order, a wait in days after the previous step is done, and an **ordered list of
  channel options**. Each option is a channel plus when it applies: _always_, _if a phone is
  known_ or _if an email is known_ (D-033 F4). The first option that applies is used when the
  step falls due, so the last option must be _always_.
  - **Channels:** LinkedIn connection request, LinkedIn message, InMail, Email, Call,
    WhatsApp, Manual task.
  - **Content:** a template purpose (the app picks the best active template for the person's
    persona and level, with Official before Personal), or a fixed template, plus a **script**
    (call script, task text, or the note on a connection request).
  - A connection request with a note counts as a touch; without a note it doesn't (D-033).
- **Versions:** saving a plan's steps creates version n+1. People already enrolled finish the
  version they started.
- **Ownership:** Admins create Official plans, which everyone can see and use. Anyone can
  create Personal plans; owners see their own and Admins see all. **Propose as Official** goes
  through Approvals (F07); approving makes the plan Official and Admin-owned. **Duplicate**
  makes a Personal copy. **Archive** hides a plan from enrolment, but people already enrolled
  carry on.

## Cadence guardrails

One module, `src/server/plans/guardrails.ts`, checks plans in the builder (`checkPlan`) and
single touches on manual logging (`checkTouch`). **Block** refuses the action. **Warn** asks
"Log anyway?", and the overridden rules are recorded in the audit entry. The values are in
Playbook Settings (F13).

A **touch** is an outreach message to the person: a connection request _with a note_, a
LinkedIn message, an InMail, an email, a WhatsApp message, or a call that connected (D-034).

| #   | Rule                                                                                                | Builder (Outreach plans)                                                                                  | Manual logging                                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Message 1–3 days after the connection is accepted                                                   | Block if the step after a connection request waits under 1 or over 3 days                                 | Warn if a message is logged the same day as Accepted                                                     |
| 2   | At least 3 days between touches before a reply, each gap longer than the last                       | Block if a gap is under 3 days or not longer than the previous gap (the gap after acceptance is rule 1's) | Warn if the last touch was under 3 days ago, or this gap isn't longer than the last, with no reply since |
| 3   | At most 4 follow-ups after Message 1, across channels                                               | Block a 5th follow-up                                                                                     | Warn on a 5th follow-up since Message 1 with no reply                                                    |
| 4   | At most 2 touches in any 7 days                                                                     | Block if any 3 touches fall within 7 days (assuming the fastest acceptance)                               | Warn on a 3rd touch in 7 days. Scheduling also moves a due date later to avoid it                        |
| 5   | Change channel rather than repeat                                                                   | Warn if two follow-ups in a row use the same first channel                                                | None                                                                                                     |
| 6   | Every follow-up adds something new                                                                  | Warn if a step's template says "just following up" or "bumping this" (the template editor warns too)      | None                                                                                                     |
| 7   | Withdraw at day 14; the plan ends by day 30 (45 for Vice President or CXO), then 60 days of Nurture | Block if the waits after the request add up to more than 30 days                                          | Block outreach while the person is in Nurture                                                            |
| 8   | Do not contact overrides everything                                                                 | Enrolment refused                                                                                         | Block all outreach; setting it stops the active plan                                                     |

Rules 1–4 and 7 apply to Outreach plans, because they are about reaching people who haven't
replied. Meeting follow-up, Trial and Onboarding plans run after a conversation has started,
so only rules 5, 6 and 8 apply to them (D-034).

## Enrolment and scheduling

- **Who:** the lead's owner or an Admin enrols one person from the person page, or many from
  **People → Enrol in plan**. Only Active plans the user can see are offered. A person is on at
  most one Active or Paused plan, enforced in the database. Do not contact, being in Nurture or
  already being on a plan skips that person, with the reason shown.
- **Due dates:** step 1 is due on the enrolment date plus its wait. Every later step is due on
  the date the previous step was **actually done** plus its wait, so doing a step late shifts
  everything after it. With Skip weekends on, a Saturday or Sunday becomes Monday. Waits are
  calendar days (D-033 F5). A date that would make a 3rd touch in 7 days moves later.
- **Connection requests:** the next step waits for **Accepted**, then is due on the acceptance
  date plus its wait. If there's no acceptance within 14 days (Playbook Settings), a
  **Withdraw invite** task appears. Withdrawing stops the plan ("Not accepted") and starts 60
  days of Nurture.
- **Time limit (ends_by):** 30 days, or 45 for Vice President or CXO seniority, counted from
  the acceptance date. If the plan doesn't start with a connection request, it counts from the
  first touch (D-033). Once ends_by has passed, the plan counts as finished.
- **Doing a step** (Today or the person's Plan panel): the message is shown with placeholders
  filled in from the person ({Name}, {First name}, {Company}, {Title}). Done is refused while
  any `{…}` is still unfilled ("Fill in {topic} first"). Done logs the touch with the exact
  text, the channel, the plan and the step number, then schedules the next step.
  - **Email:** "Open in mail app" opens the rep's own mail app with the text (`mailto:`), then
    the rep clicks Done. The app never sends sales email.
  - **Call:** shows the script and the outcomes:
    - Connected: done.
    - No answer: retried the next business day, up to 2 retries, then on to the next step.
    - Call back later: the rep picks a date.
    - Wrong number: done, and the number is removed (kept in the activity text).
    - Not interested: the plan stops, and the page offers Mark lost.
  - **WhatsApp / Manual task:** the rep clicks Done.
- **Quick-log on a plan:** if a quick-log button matches the current step's channel, the app
  asks **"Is this step N of their plan?"** Yes does the step; No logs an extra touch, checked by
  the guardrails.
- **Replies:** any logged reply pauses the plan in the same save. **Resume** makes the current
  step due on the resume date (weekday, within the guardrails) and moves ends_by later by the
  days paused. **Switch** stops the current plan ("Switched") and starts another. **Stop** ends
  it.
- **Finished with no reply** (after the last step, or once ends_by has passed): Today asks
  **Nurture** (no touches for 60 days) or **Lost** ("No response"). When Nurture ends, a
  **Nurture check** task offers re-enrolment or Lost.
- **Stage changes suggest a plan:** Meeting done → Meeting follow-up, Trial → Trial, Paid →
  Onboarding, shown on the person page.

## Seed plans

**Official Outreach** (Official, owned by somnath@, Skip weekends on, version 1):

| #   | Channel options                                                          | Content                                         | Wait                    |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------- |
| 1   | LinkedIn connection request (no note)                                    |                                                 | day 0                   |
| 2   | LinkedIn message                                                         | Message 1 template                              | 2 days after acceptance |
| 3   | LinkedIn message                                                         | Follow-up 1 template (a short video or example) | +4 days                 |
| 4   | Call if a phone is known → Email if an email is known → LinkedIn message | Call script / Follow-up 2 template              | +7 days                 |
| 5   | LinkedIn message                                                         | Break-up template                               | +10 days                |

**Meeting follow-up, Trial and Onboarding** plans are drafts, seeded as Proposed (Personal,
owned by somnath@) for an Admin to approve in Approvals before use. `npm run seed:plans` adds
missing seed plans and never changes existing ones.

## Screens

- **Plans** (sidebar, after Templates): Official / My plans / All (Admin) tabs. Each card shows
  the type, persona, number of steps, version, status, and how many people are enrolled.
- **Plan page:** the steps with channels, waits and content; the guardrail results; Edit
  steps (builder) for whoever may edit; Duplicate, Propose as Official, Archive; the change
  history.
- **Person page:** a Plan panel with the current step, due date, message or script, Done,
  call outcomes, Pause/Resume, Switch and Stop.
- **People:** Enrol in plan for selected rows.

## Tests

- Automated:
  - every guardrail at its edge values, in the builder and on manual logging
  - the note rule
  - the seed plan passes
  - scheduling: on time, late, weekends, waiting for acceptance, day-14 withdraw, the
    weekly-limit push, call retries, pause and resume
  - ends_by from acceptance, including acceptance on day 13 still reaching Break-up
  - versions stay with their enrolment
  - one active plan per person (database)
  - Do not contact
  - the placeholder block
  - quick-log Yes/No
  - permissions
- Browser (R7 exit check): enrol a person in the seed plan, complete steps on time and late,
  weekends skipped and dates shifted, a pasted reply pauses the plan, and the builder blocks a
  sixth touch.

## Change history

| Date       | Version    | Change                                                                                                                                                                                                                                                                          |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | Unreleased | Feature doc written (R7), before code.                                                                                                                                                                                                                                          |
| 2026-10-18 | Unreleased | Guardrails (checkPlan, checkTouch) and scheduling rules built with tests, including acceptance on day 13.                                                                                                                                                                       |
| 2026-10-18 | Unreleased | Plans page, plan page and builder (live guardrail checks), versions, duplicate, propose, archive; plan proposals in Approvals; plan permissions.                                                                                                                                |
| 2026-10-18 | Unreleased | Enrolment: enrol from People or the person page; Plan panel (Done, call outcomes, Snooze, Pause/Resume, Switch, Stop, Withdraw, Nurture/Lost); quick-log "Is this step N?"; replies pause plans; Do not contact stops them; placeholder block; local test date switch on About. |
| 2026-10-18 | Unreleased | R7 browser exit check added (e2e/r7-exit-check.spec.ts).                                                                                                                                                                                                                        |
