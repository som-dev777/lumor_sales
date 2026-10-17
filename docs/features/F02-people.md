# F02: People

- **Priority:** P0 · **Release:** R3 (v1.2.0) · **Status:** In progress
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
4. **Ownership:**
   - Whoever adds a person owns them. Admins can choose another active owner.
   - Only the owner or an Admin edits a person (`lead.edit`).
   - Anyone can add a note to anyone's lead (`lead.addNote`). A note is a "Meeting note"
     activity on the timeline.
   - Deactivated users are hidden from owner pickers.
5. **Stage:** the 10 PRD stages, chosen in the edit form.
   - Lost requires a lost reason (database CHECK too). Leaving Lost clears the reason.
   - A manual stage change logs a "Stage change" activity.
   - Quick-log buttons that move stages come in R4 (F15).
6. **Company:** type a company name. An existing company (same name, any case) is linked;
   otherwise a new company is created, owned by the lead's owner.
7. **Bulk reassign (Admin):** select rows, choose a new owner, confirm. Each person gets its own
   "Reassigned" audit entry.
8. **CSV export:** the current filtered view, all matching rows (up to 10,000).
9. Every create, edit, note, stage change and reassignment is audited.

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

## Change history

| Date       | Version    | Change                                                                                                          |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | Unreleased | Placeholder doc created.                                                                                        |
| 2026-10-17 | Unreleased | Full doc written (R3).                                                                                          |
| 2026-10-17 | Unreleased | Rules built: link normalising, duplicates, ownership, notes, stage changes, bulk reassign, filters; with tests. |
