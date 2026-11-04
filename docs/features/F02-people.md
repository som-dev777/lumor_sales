# F02: People

- **Priority:** P0 · **Release:** R3 (v1.2.0) · **Status:** Done (v1.2.0)
- **PRD:** [Screens → People, Person detail](../PRD.md#screens-and-functional-requirements), [Business rules → LinkedIn duplicate check](../PRD.md#business-rules)

## What it does

One shared, de-duplicated list of every lead. Each person has one owner. Nobody can add the
same LinkedIn profile twice, so two reps never message the same person.

## Rules

1. **LinkedIn link (main field, required):** only public profile links (`linkedin.com/in/…`).
   A Sales Navigator link (`linkedin.com/sales/…`) is refused with "Paste the public profile
   link (linkedin.com/in/…)". Sales Navigator links go in their own optional field, which
   only accepts `linkedin.com/sales/…`.
2. **Normalising** (before every save):
   - lowercase
   - strip `http://`, `https://`, `www.` and `m.`
   - drop query strings and fragments, and the trailing slash
   - e.g. `https://www.LinkedIn.com/in/Priya-S/?utm_source=x` → `linkedin.com/in/priya-s`
   - Country subdomains (`in.linkedin.com`) count as the same profile.
3. **Duplicates:** the normalised link is unique (the database enforces it). Checked on create
   and edit. A duplicate blocks the save and shows "Already added by {owner}" with a link to
   the existing person.
4. **Company (required, D-040):** every person belongs to a company, chosen from a dropdown of
   existing companies; **+ Add a new company** at the bottom of the list shows a name box and
   creates it on save. "Add person" on a company page fills its company in.
5. **Deleting (Admins, `lead.delete`):** **Delete** on a person's page removes the person with
   their conversation and plan history, after a confirmation. The Audit Log keeps a copy;
   saved reports keep their numbers.
6. **Ownership:**
   - Whoever adds a person owns them. Admins can choose another active owner.
   - Only the owner or an Admin edits a person (`lead.edit`).
   - Anyone can add a note to anyone's lead (`lead.addNote`). A note is a "Meeting note"
     activity on the timeline.
   - Deactivated users are hidden from owner pickers.
7. **Stage:** the 10 PRD stages, chosen in the edit form.
   - Lost requires a lost reason (database CHECK too). Leaving Lost clears the reason.
   - A manual stage change logs a "Stage change" activity.
   - Quick-log buttons that move stages come in R4 (F15).
8. **Company:** type a company name. An existing company (same name, any case) is linked;
   otherwise a new company is created, owned by the lead's owner.
9. **Bulk reassign (Admin):** select rows, choose a new owner, confirm. Each person gets its own
   "Reassigned" audit entry.
10. **CSV export:** the current filtered view, all matching rows (up to 10,000).
11. Every create, edit, note, stage change and reassignment is audited.

## v2 fields (R7)

- **Phone** and **email** (optional, checked for shape). Plans use them to choose a call or an
  email step (F17).
- **Seniority** (optional, the persona seniority list). Vice President and CXO get the 45-day
  Outreach limit (D-033).
- **Do not contact** with a reason (required) and the date it was set. It stops the person's
  plan and blocks outreach logging on the server.
- Stages use the v2 list (D-029). The People list and export show the person's plan and step
  instead of the old sequence step.

## Screens

- **`/people`:**
  - My leads / All leads toggle (My leads is the default for Users, All for Admins)
  - filters: owner, persona, level, account filter, stage, market, next action date
    (Overdue / Today / This week, in IST; "This week" is Monday–Sunday, so it
    includes days earlier this week; Paid and Lost leads are left out of all three), plus search by name, title or company
  - a table with 50 per page: name and title, company, persona, stage, next action and
    date (red when overdue), owner
  - Add person dialog; Export CSV; Admins get row checkboxes and "Reassign owner"
- **`/people/[id]`:**
  - header: name, title, company, persona, stage, sequence step, owner, next action and
    date, LinkedIn link (opens a new tab), Sales Navigator link
  - Edit (owner or Admin)
  - "This lead is claimed by {owner}" for other Users
  - Add note
  - timeline of every activity, newest first
  - the person's change history

## Tests

- Automated:
  - URL rules: every normalising case, Sales Navigator refused, the 5 variants of one profile
    give the same result
  - create, edit and duplicate refusals with the owner's name
  - lost reason; manual stage change logs an activity
  - permissions (claimed lead, notes by others, Admin-only reassign); company created or linked
  - filters including IST next-action buckets; CSV
- Browser (R3 exit check): the same person through five URL variants and a Sales Navigator link
  gives exactly one record.

## LinkedIn or email, and Check details (v2.7.0, D-043)

- A person needs a **LinkedIn profile or an email** (before: LinkedIn always). The form says
  so; the duplicate check uses LinkedIn when there is one, and email otherwise.
- People created from a booking (F22) or Calendly (F27) carry a **Check details** flag: a
  banner on their page ("From the booking page: check details") with **Done checking**, which
  clears it (audited).
- A red **Backlog** badge and a **Backlog only** filter (F08).

## Change history

| Date       | Version | Change                                                                                                                                                                                                                                                      |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.2.0   | Placeholder doc created.                                                                                                                                                                                                                                    |
| 2026-10-17 | 1.2.0   | Full doc written (R3).                                                                                                                                                                                                                                      |
| 2026-10-17 | 1.2.0   | Rules built: link normalising, duplicates, ownership, notes, stage changes, bulk reassign, filters; with tests.                                                                                                                                             |
| 2026-10-17 | 1.2.0   | People list (filters, My/All, bulk reassign, CSV) and person page (header, claimed message, notes, timeline, history) built; R3 browser test.                                                                                                               |
| 2026-10-17 | 1.2.0   | Released in v1.2.0 (R3 Leads).                                                                                                                                                                                                                              |
| 2026-10-18 | 2.0.0   | v2 (R7): phone, email, seniority, Do not contact; v2 stages; plan shown in the list and export.                                                                                                                                                             |
| 2026-10-18 | 2.0.0   | Released in v2.0.0 (R7 Plans).                                                                                                                                                                                                                              |
| 2026-10-30 | 2.4.0   | A company is required (dropdown of existing companies, or + Add a new company); Admins can delete a person; My leads / All leads show a loading dot while switching (D-040).                                                                                |
| 2026-10-30 | 2.4.0   | Released in v2.4.0 (QA round 1).                                                                                                                                                                                                                            |
| 2026-11-02 | 2.5.0   | **Fill with AI** on the person form (F24).                                                                                                                                                                                                                  |
| 2026-11-02 | 2.5.0   | Person page **Meetings** panel with booking links (F22); released in v2.5.0.                                                                                                                                                                                |
| 2026-11-03 | 2.7.0   | LinkedIn or email, Check details flag, Backlog badge and filter written (D-043), before code.                                                                                                                                                               |
| 2026-11-03 | 2.7.0   | Built: LinkedIn or email (duplicate check on email when there's no LinkedIn); review_note set by bookings and Calendly.                                                                                                                                     |
| 2026-11-03 | 2.7.0   | Built: Backlog badge on the list and the person page, Backlog only filter, Check details banner with Done checking.                                                                                                                                         |
| 2026-11-03 | 2.7.0   | Released in v2.7.0 (D-043).                                                                                                                                                                                                                                 |
| 2026-11-04 | 2.8.0   | Office choice (one of the company's offices, F28); the person page shows the office and who added them; a new owner and the previous one are notified; save problems show next to the buttons (D-054).                                                      |
| 2026-11-04 | 2.9.0   | A–Z by default; Sort by (name, activity, added, next action, backlog); Activity and Plan filters; filters in a slim bar with chips; "Overdue" is now Backlog (late work); logging anything clears the backlog badge; Follow-up in the conversation (D-055). |
