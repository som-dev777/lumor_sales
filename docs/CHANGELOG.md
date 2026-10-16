# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]

Nothing yet. R2 (Library) starts next.

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
