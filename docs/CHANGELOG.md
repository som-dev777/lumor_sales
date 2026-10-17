# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]` (skipped by the sync).
- Each release: a `## [X.Y.Z] - YYYY-MM-DD` heading, one summary sentence, then `- ` bullets.

## [Unreleased]

R4 Daily work, in progress.

- Feature docs written for Quick-log (F15) and Dashboard (F11); D-023 (getting ready to go online).
- Quick-log rules on the server: each action logs the activity and moves the stage, sequence step and next action, with follow-up dates counted from Message 1 (F15).
- Person page: a "Log what happened" bar (Request sent, Accepted, Message 1 sent, the next follow-up, Got a reply, Demo booked, Demo held, Mark converted, Mark lost). Reply type, demo date and lost reason are asked for; a note can be added. After converting, the page offers to mark the company as a customer (F15).
- Dashboard counting on the server: funnel stages for a week or month in IST, conversions against benchmarks (amber only with 10+ in the earlier stage), and breakdowns (F11).

## [1.2.0] - 2026-10-17

R3 Leads: one shared, de-duplicated list of people and companies.

- People page: My leads / All leads, filters (owner, persona, level, account filter, stage, market, next action Overdue/Today/This week), search, and Export CSV of what you see.
- Add a person with their public LinkedIn link. The same profile can never be added twice: any variant of the link (with or without www, https, tracking codes, mobile or country addresses) is recognised, and you're shown "Already added by {owner}" with a link to them. Sales Navigator links go in their own field.
- Person page: details, LinkedIn link, Edit (owner or Admin) or "This lead is claimed by {owner}", notes anyone can add, a timeline of everything logged, and the change history. Lost needs a reason, and changing the stage is logged.
- Admins can select several leads and reassign their owner in one go.
- Companies: typed on a person, linked by name (no duplicates, whatever the capitals). Company page with the deal in ₹, its people, a combined timeline, and Mark as customer.
- Change history and the Audit Log show names instead of internal codes.

## [1.1.0] - 2026-10-17

R2 Library: the team's playbook of personas, account filters and templates, with proposals and approvals.

- Personas, Account Filters and Templates pages, each with Official and Personal tabs, "Mine only" and "Show archived", and a card per item with live stats (leads, replied, demos, paid, reply rate; templates show times used and reply rate).
- The starting playbook from the PRD is loaded: 5 personas, account filters A1–A6 and 12 version-A templates.
- Official items are the team's playbook: only Admins change them, and Users see a lock. Anyone can keep Personal items and duplicate any item into their own Personal copy.
- Propose a Personal item as Official. Admins approve (it becomes Official, owned by them) or reject with a note on the new Approvals page, which shows the number waiting in the sidebar. You see the outcome on your item and in "Your proposals".
- Archive instead of delete: items that leads use can't be deleted, only archived, and archived items can be restored.
- Persona function and seniority: tick the built-in options or add your own, which everyone can then pick.
- Templates are grouped by purpose, with A/B/C versions and highlighted {placeholders}. Changing a template's wording keeps the earlier wording.
- Account filter codes: Official codes are unique; copies get a "-copy" code.
- Every change is recorded in the Audit Log, and each card has its own change history.
- Short confirmation messages after each action; fixed a console warning caused by browser extensions.

## [1.0.0] - 2026-10-16

R1 Foundation: login and team management, the Audit Log, the About page, and the app's design and navigation.

- Log in with email and password. Anyone with an @lumor.tech email can sign up as a User; anyone else joins through an Admin's invite link (works once, for 7 days).
- Three default Admins: somnath@, arijeet@ and prince@lumor.tech. Everyone can change their password from the sidebar.
- Settings → Users (Admins): invite people, see pending invites, make someone an Admin or a User, deactivate and reactivate, and create password reset links (work once, for 24 hours). You can't change your own role or deactivate yourself, and there's always at least one active Admin.
- Deactivated people are blocked at once: every page shows "Access disabled, contact your admin" and their login is refused. Nobody is ever deleted.
- Users don't see Approvals or Audit Log, and get "Not allowed" if they open them, checked on the server, not just hidden.
- Audit Log (Admins): every change with who, when and before/after values; search, filters, CSV export. Entries can't be edited or deleted by anyone, enforced by the database itself.
- About page: the current version and the latest releases.
- Lumor design: logo, Inter font, brand colours, a left sidebar with all 11 sections (later ones show which release builds them), and a mobile menu.
- Behind the scenes: one shared permission check and one audit writer for every change, the full database for all 16 features, India time everywhere, 106 automated tests and 13 browser tests, and the docs system.
- Known gaps before going online at R4: email verification for sign-up, limits on repeated wrong passwords, and changing the shared default Admin password (decisions D-011 to D-013).
- Library rules on the server (F04–F07): create, edit, archive, restore, delete (blocked when in use), duplicate and propose for personas, account filters and templates; template wording edits keep old revisions; approve (becomes Official and Admin-owned) and reject with a note; live stats per item. Every change checks permissions and is audited. 23 new tests.
- Starting playbook: `npm run seed:library` loads the PRD's 5 Official personas, 6 account filters (A1–A6) and 12 version-A templates, owned by somnath@lumor.tech. Running it again adds nothing and keeps edits.
- Personas page (F04): Official and Personal tabs (with "Mine only" and "Show archived"), a card per persona with live stats and all fields, Add and Edit forms, Duplicate to my Personal, Propose as Official, Archive/Restore, Delete (refused with a clear message when in use) and Change history. Official personas show a lock for Users. A "Your proposals" strip shows outcomes. Short confirmation messages appear after each action.
- Persona form: Function and Seniority have an "Add another" box; a new option is offered to everyone afterwards (D-018).
- Fixed a console warning caused by browser extensions (such as ColorZilla) adding attributes to the page.
- Account Filters page (F05): the same tabs, cards and actions as Personas, sorted by code, with each filter's industries ("Any" when empty), headcount, HQ, key filters, keywords, exclusions and why it matters. Official codes must be unique; Personal filters may reuse one; copies get a "-copy" code.
- Templates page (F06): templates grouped by purpose in the PRD's order, each with its version (A/B/C), persona, level and revision number, the wording with {placeholders} highlighted, times used and reply rate. The form lists placeholders as you type. Changing the wording keeps the old one under "Earlier wordings"; renaming doesn't create a revision.
- Approvals page (F07, Admins): proposals oldest first, each with a preview of the item and who proposed it; Approve (it becomes Official, owned by you, and locked for Users) or Reject with an optional note the proposer sees; a "Recently decided" list; the number waiting shows next to Approvals in the sidebar.
- Browser tests for the R2 exit check (10 tests): a User proposes a persona, an Admin approves it, and it shows as Official and locked.
- People and company rules on the server: LinkedIn links normalised so the same profile can never be added twice ("Already added by {owner}"), Sales Navigator links refused in the main field, owner rules, notes on anyone's lead, manual stage changes logged, Lost needs a reason, Admin bulk reassign, company names unique ignoring case, mark as customer. 24 new tests.
- People page (F02): My leads / All leads, filters (owner, persona, level, account filter, stage, market, next action Overdue/Today/This week) and search, 50 per page, Add person (pick or type a company), Admin bulk reassign, Export CSV. Person page: details, LinkedIn link, Edit (owner or Admin) or "This lead is claimed by {owner}", notes by anyone, timeline and change history.
- Companies pages (F03): list with status, people, owner and deal; company page with deal (₹), people, a timeline of all their people, Edit and Mark as customer.
- Change history and the Audit Log now show names instead of record ids, use plain labels, and leave out empty fields.
- Browser tests for the R3 exit check (11 tests): the same person through five URL variants and a Sales Navigator link creates exactly one record.
