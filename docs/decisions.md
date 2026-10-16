# Decisions

Significant choices and why they were made. Newest at the bottom. Each entry has a number,
date, status, decision and reason. Never rewrite an old decision; add a new one that
replaces it.

## D-001: SQLite + Better Auth, with server-side permission checks

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** Use SQLite (Drizzle ORM + libSQL client; `data/app.db` locally, Turso in
  production) and Better Auth, as the PRD specifies. SQLite has no row-level security, so
  every permission is enforced by one shared server-side check (`assertCan()`). Hard rules
  are also locked in the database with triggers and constraints:
  - the audit log is insert-only
  - users can't be deleted
  - deactivation deletes sessions
  - in-use items can't be deleted (foreign keys are RESTRICT)
- **Why:** One code path for local and production, no external database service to manage,
  and the browser never talks to the database, so the server check is the gate.
  This replaces the Supabase plan from the earlier PRD draft.

## D-002: Invite and password-reset links are copied by the Admin (no email yet)

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** In R1 the app shows invite and reset links to the Admin, who sends them by
  WhatsApp, Slack or email. Links are also printed in the terminal during development.
  The "Forgot password" page tells users to ask their admin for a reset link.
- **Why:** Gets R1 working without an email provider account or domain setup.
- **Planned for R4:** send invite and reset emails through Resend (listed in the PRD stack),
  before the team starts using the app.

## D-003: Node.js 22 or newer

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** `package.json` requires Node `>=22`. The owner's computer runs Node 24, which is
  fine. Netlify will be pinned to Node 22 at R4.
- **Why:** The PRD names Node 22 LTS. Node 24 is also an LTS version and runs the same code.

## D-004: Version bumps once per release, not per change

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** Bump MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…) and PATCH for fixes.
  Between releases, changes collect under "Unreleased" in the CHANGELOG. AppRelease records
  are added only at a release or patch.
- **Why:** The owner's instruction. It overrides the PRD line "every change … bumps the
  version", which would create dozens of meaningless versions during a release.

## D-005: Known warnings in development-only tools are accepted

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** `npm audit` reports moderate/high issues in `drizzle-kit`'s bundled esbuild
  and other build-time tools. They are left as is and rechecked at each release.
- **Why:** These tools only run on the developer's computer while building. They are not
  part of the app that runs on Netlify. The suggested "fix" downgrades drizzle-kit to a
  much older, incompatible version.

## D-006: Forced password change for the seeded Admin

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** `user.must_change_password` (0/1). The seed script creates the first Admin
  with a one-time password and the flag set to 1. While it is 1, every page and server
  action sends the user to `/change-password`. Changing the password clears the flag and
  writes an audit entry.
- **Why:** The owner's instruction. A printed one-time password must not stay usable.

## D-007: Extra support tables and defaults not in the PRD

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:**
  - an `invite` table (stores only a hash of each invite link's secret)
  - a `template_revision` table (keeps old template bodies when one is edited)
  - `daily_message_target` defaults to 10
- **Why:** The PRD needs invite-only signup and "editing a template creates a new version
  and keeps the old one", but its data model has no place for either. It gives no default
  for the daily message target.

## D-008: Better Auth admin plugin, with `active` as the source of truth

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** Use Better Auth's admin plugin (as the PRD lists). Its extra columns (`banned`,
  `ban_reason`, `ban_expires` on user; `impersonated_by` on session) are in the schema.
  Lumor's own `role` ('Admin'/'User') and `active` columns stay the source of truth.
  Deactivating a user sets `active = 0` and `banned = 1` in the same transaction;
  reactivating clears both.
- **Why:** Two independent locks. Our checks refuse inactive users, and Better Auth refuses
  banned users at login by itself. Database tests cover the session trigger.

## D-009: Keep Next.js Cache Components and Partial Prefetching on

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:** Keep `cacheComponents: true` and `partialPrefetching: true`, which this
  Next.js version sets by default. Pages are pre-built as a static frame (sidebar, headings).
  Anything that depends on the signed-in user or the database is placed inside a
  `<Suspense>` boundary and streams in at request time. Nothing user-specific is cached
  with `use cache`.
- **Why:** Both become mandatory in the next major Next.js version, so turning them off would
  mean redoing the work later. The static frame also makes pages appear instantly, which
  helps the PRD's 400 ms feedback target.
- **Note:** Next's experimental `forbidden()` page isn't used. A normal "Not allowed"
  screen is rendered instead.

## D-010: No Better Auth admin plugin or web endpoints; deactivation keeps the session

- **Date:** 2026-10-16 · **Status:** Accepted. **Replaces D-008** and the session-deleting
  trigger listed under D-001.
- **Decision:**
  - The Better Auth admin plugin isn't used. Its `banned`, `ban_reason`, `ban_expires` and
    `impersonated_by` columns are removed.
  - Better Auth's own web endpoints aren't mounted (no `/api/auth` route). Login, logout and
    password changes run through our Server Actions, which call `auth.api.*` on the server.
  - Users are created only by our code (invite registration, seed script). A Better Auth hook
    refuses every other attempt.
  - Deactivation no longer deletes sessions (the `user_deactivate_kills_sessions` trigger is
    gone). Every page and action checks `active` and sends the person to `/disabled`.
    Better Auth refuses a deactivated user's login.
- **Why:**
  - The admin plugin exposes about 15 endpoints (create user, set role, remove user,
    impersonate…) that an Admin could call directly, skipping `assertCan()` and
    `writeAudit()`. That breaks the PRD's "every change is auditable".
  - Its only other job, refusing banned users at login, is a few lines in our own hook.
  - The PRD says a deactivated user opening any URL sees "Access disabled, contact your
    admin". If the session were deleted, the app couldn't know who they were and would show
    the login page instead.
  - With no Better Auth endpoints mounted and every page and action re-checking `active`,
    a kept session gives a deactivated user no access.

## D-011: Login attempt limiting is still to do (before R4)

- **Date:** 2026-10-16 · **Status:** Open
- **Decision:** Better Auth's built-in rate limiting only covers its web endpoints, which aren't
  mounted (D-010). Nothing limits repeated wrong passwords yet. Before the team starts using
  the app at R4, add attempt limiting to the login action, stored in the database so it works
  on Netlify.
- **Why:** It doesn't matter on a single computer, but it does once the app is on the internet.
