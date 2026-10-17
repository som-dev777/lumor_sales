# F04: Personas

- **Priority:** P0 · **Release:** R2 (v1.1.0) · **Status:** In progress
- **PRD:** [Screens → Personas and Account Filters](../PRD.md#screens-and-functional-requirements), [Business rules → Library items](../PRD.md#business-rules), [Appendix: seed data](../PRD.md#appendix-seed-data)

## What it does

A persona describes a type of buyer the team targets: who they are, what tools they use
today, and what to lead with. Official personas are the team's agreed playbook, curated by
Admins. Anyone can keep Personal personas to try ideas, and propose a good one as Official
(F07). Each persona shows live stats, so the team can see which ones convert.

## Library rules (shared by personas, account filters F05 and templates F06)

1. **Two tabs:** Official and Personal.
   - **Official:** visible to everyone. Only Admins can add, edit, archive or delete; Users
     see a lock icon and no edit controls.
   - **Personal:** shows everyone's Personal items with the owner's name, plus a "Mine only"
     switch. Only the owner can edit, archive or delete their Personal items. Admins can't
     edit someone else's Personal items, but can view and duplicate them, like everyone.
2. **Duplicate:** anyone can duplicate any item (Official or Personal). The copy is a new
   Personal item owned by you, named "Copy of …", with no proposal status.
3. **Propose as Official:** the owner of a Personal item can propose it (F07). While it's
   waiting, it shows "Proposed" and can't be proposed again. The outcome (Approved or
   Rejected, with the Admin's note) shows on the item.
4. **Archive, don't delete, when in use:**
   - An item that any lead, company, template or activity points to can't be deleted.
     The app explains how many leads use it and offers Archive instead. The database
     refuses the delete too.
   - Archived items are hidden from pickers and from the default list ("Show archived"
     brings them back), but stay visible on old records. They can be restored.
   - Unused items can be deleted.
5. **Live stats on each card** count only that item's own leads (people whose persona,
   account filter or opener template is this item) and their activities:
   - **Leads:** people pointing to it.
   - **Replied:** those with at least one "Reply received" activity.
   - **Demos:** those with at least one "Demo booked" activity.
   - **Paid:** those marked converted.
   - **Reply rate:** replied ÷ people with a "Request accepted" activity. Shown as "—" when
     nobody has accepted yet. (Accepted → Replied is the PRD's 10% benchmark step.)
   - All zero until leads exist (R3).
6. **Audit:** every create, edit, archive, restore, delete, duplicate and proposal writes
   an audit entry. Each card shows its own change history (the ChangeHistory panel).
7. **Permissions** use the shared check: `library.create`, `library.edit`,
   `library.delete`, `library.duplicate`, `library.propose` (see
   [roles-permissions.md](../roles-permissions.md)).

## Persona fields

| Field            | Rules                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name             | required, up to 100 characters                                                                                                                               |
| Tier             | 1, 2 or 3 (1 = highest priority)                                                                                                                             |
| Function         | multi-select: Research, Insights, Product, Design, CX, Brand, Marketing, Leadership, Consulting (D-015), plus team-added options (D-018)                     |
| Seniority        | multi-select: Entry Level, Senior, Entry Level Manager, Experienced Manager, Director, Vice President, CXO, Owner / Partner, plus team-added options (D-018) |
| Job titles       | list                                                                                                                                                         |
| Geography        | list, default "India"                                                                                                                                        |
| Who it covers    | text                                                                                                                                                         |
| Tools used today | text                                                                                                                                                         |
| Lead-with angle  | text                                                                                                                                                         |
| Notes            | text                                                                                                                                                         |

## Screen: `/personas`

- Tabs Official and Personal, with counts. "Show archived" switch. "Mine only" on Personal.
- **Add persona** button (both tabs; on Official only for Admins).
- One card per persona: name, tier, the fields above, live stats, owner (Personal), status
  badges (Archived, Proposed, Approved, Rejected with note), and actions:
  Edit · Duplicate · Propose as official · Archive / Restore · Delete · History.
- Add/edit in a dialog with the same fields; tags-style inputs for lists.
- Empty, loading and error states.

## Seed data (R2)

The 5 Official personas from the PRD appendix, owned by the first default Admin: Research &
Insights (Tier 1), Product & Design (2), CX, Brand & Marketing (2), Founders & Agency
Directors (1), Independent Researchers & Consultants (1). Each has its example titles,
tools and lead-with angle. Geography is India. Loaded by `npm run seed:library`; running it
again changes nothing.

## Tests

- Automated: create/edit/archive/restore/delete per the permission rules, delete blocked when
  in use, duplicate, propose (once while pending), stats counts, audit entries, seed loads once.
- Browser: Official is locked for a User; a User creates, duplicates and proposes a persona.

## Change history

| Date       | Version    | Change                                                                                                                                         |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | Unreleased | Placeholder doc created.                                                                                                                       |
| 2026-10-16 | Unreleased | Full doc written (R2), with the shared library rules.                                                                                          |
| 2026-10-16 | Unreleased | Library rules built on the server (`src/server/library/`), with tests.                                                                         |
| 2026-10-17 | Unreleased | Seed: 5 Official personas from the PRD (`npm run seed:library`), with tests.                                                                   |
| 2026-10-17 | Unreleased | Personas page built: tabs, cards with stats, add/edit form, duplicate, propose, archive/restore, delete, change history, Your proposals strip. |
| 2026-10-17 | Unreleased | Function and seniority accept new options ("Add another"), offered to everyone afterwards (D-018).                                             |
