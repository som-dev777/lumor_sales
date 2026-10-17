# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]

R2 Library, in progress.

- Feature docs written for Personas (F04), Account filters (F05), Templates (F06) and Approvals (F07), with the shared library rules; decisions D-015 to D-017.

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
