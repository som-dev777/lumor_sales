# F21: Industries

- **Priority:** P1 · **Release:** v2.4.0 · **Status:** Done
- **Decisions:** D-040 (the owner's first live QA round, 2026-10-30)

## What it does

One shared list of industries, used by the company form's **Industry** and by account
filters' industries, on **Settings → Industries**.

## Rules

- **Add:** anyone (`lead.create`). Names are unique ignoring case ("Retail" = "retail"), 2–100
  characters.
- **Rename and delete:** Admins (`settings.edit`).
  - Renaming changes it on every company and account filter that uses it.
  - Deleting clears it from those companies and removes it from those account filters, after a
    confirmation that says how many use it.
- **Automatic:** saving a company or account filter with an industry that isn't on the list
  adds it (the company form's **+ Add a new industry**, or an account filter's industries).
- **Starting list:** `npm run seed:industries` (also run by every Netlify build) fills an empty
  list from the industries companies and account filters already use. Once the list has
  entries it does nothing.
- Every add, rename and delete writes an audit entry.

## Screens

- **Settings → Industries:** add box; each industry with "used by N companies and M account
  filters"; Edit and Delete for Admins.
- **Company form:** Industry is a dropdown from the list, with **+ Add a new industry**.

## Tests

- Automated: starting list from what's in use; new industries join the list when used; no
  duplicates ignoring case; rename and delete follow through to companies; only Admins rename or
  delete.
- Browser: a rep adds an industry and uses it on a company; an Admin renames it (the company
  follows) and deletes it.

## Change history

| Date       | Version | Change                                                              |
| ---------- | ------- | ------------------------------------------------------------------- |
| 2026-10-30 | 2.4.0   | Feature added from the owner's QA round; doc written with the code. |
| 2026-10-30 | 2.4.0   | Released in v2.4.0 (QA round 1).                                    |
