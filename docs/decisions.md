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

## D-012: Self sign-up for @lumor.tech emails

- **Date:** 2026-10-16 · **Status:** Accepted. Changes the PRD rule "Users can't sign up
  without an invite".
- **Decision:**
  - A public `/signup` page lets anyone with an `@lumor.tech` email create their own account
    as a **User**.
  - Other emails, look-alike domains (`lumor.tech.evil.com`) and subdomains are refused.
  - The default Admin emails (D-013) can't be claimed through sign-up.
  - People with other emails still need an invite from an Admin.
- **Why:** The owner's choice. The team can join without waiting for an Admin.
- **Known risk until R4:** there's no email sending yet (D-002), so the app can't check that
  the person really owns the address they type. Anyone who can reach the app could sign up
  as an unused @lumor.tech address and see all data.
- **Planned for R4:** verify sign-up emails through Resend before the account works, and
  before the app goes online.

## D-013: Three default Admins with a shared starting password

- **Date:** 2026-10-16 · **Status:** Accepted. Replaces D-006 (forced password change) and
  the PRD's first Admin (s.chakraborty1409@gmail.com).
- **Decision:**
  - `npm run seed:admin` creates somnath@, arijeet@ and prince@lumor.tech as Admins.
  - Their starting password is `SEED_ADMIN_PASSWORD` from `.env.local`. It is never in the
    code or on GitHub.
  - They aren't forced to change it; they can change it any time from the sidebar
    ("Change password").
  - `npm run seed:admin -- --reset` puts the starting password back if someone is locked out.
  - The forced-change mechanism (`must_change_password`) stays in the app for later use.
- **Why:** The owner's choice.
- **Known risk:** a shared, guessable Admin password. Each default Admin should change theirs
  before the app goes online at R4. The R4 checklist includes checking this.

## D-014: Dependency warnings rechecked at v1.0.0

- **Date:** 2026-10-16 · **Status:** Accepted. Confirms D-005 for this release.
- **Decision:** `npm audit` still reports 9 warnings (4 moderate, 5 high). None of them reach
  the live app:
  - **High:** `braces`, inside ESLint (the code checker), which only runs on the developer's
    computer.
  - **Moderate:** esbuild, inside `drizzle-kit` (the database setup tool). It's listed as an
    optional peer of Better Auth's command-line tool, which the app doesn't use.
  - The suggested "fix" downgrades these tools to old, incompatible versions.
- **Why:** Re-checking at every release is the rule in D-005. Recheck again at v1.1.0.

## D-015: Persona lists come from the PRD (the Base44 spec isn't available)

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:**
  - The PRD says the full seniority, function and title lists are in
    `base44-prompt-lumor-sales-hub.md` §6, which isn't in the project. So:
    - seniority uses the PRD's 8 levels
    - job titles and tools use the PRD appendix examples
    - function uses: Research, Insights, Product, Design, CX, Brand, Marketing,
      Leadership, Consulting
  - Admins can edit any Official persona.
  - If the Base44 file is added to docs/, the seed and the function list will be updated
    from it.
- **Why:** The owner's choice: start R2 with what the PRD has.

## D-016: No SMB QR persona or account filter in the seed (for now)

- **Date:** 2026-10-16 · **Status:** Accepted. Answers a PRD open question.
- **Decision:** The seed loads only the PRD's 5 personas and 6 account filters. An Admin can
  add SMB QR items in the app later.
- **Why:** The owner's choice: the details aren't decided yet.

## D-017: Library details the PRD leaves open

- **Date:** 2026-10-16 · **Status:** Accepted
- **Decision:**
  - The Personal tab shows everyone's Personal items (the PRD lets anyone view and duplicate
    them), with a "Mine only" switch.
  - Only the owner edits, archives or deletes a Personal item. Admins manage Official items.
  - **Reply rate** on persona, filter and template cards = people with a reply ÷ people who
    accepted the connection request. That's the PRD's Accepted → Replied benchmark step.
  - Archiving or deleting an item with a pending proposal withdraws it (recorded as Rejected,
    "Withdrawn by the owner").
  - Approving an account filter whose code clashes with an Official one is refused until
    it's renamed.
- **Why:** These keep ownership simple and make stats comparable with the dashboard
  benchmarks (R4).

## D-018: Teams can add their own persona function and seniority options

- **Date:** 2026-10-17 · **Status:** Accepted. Extends D-015.
- **Decision:**
  - In the persona form, Function and Seniority still offer the built-in lists as tick-boxes,
    plus an "Add another" box.
  - A new option is saved on that persona and offered to everyone as a tick-box from then on.
  - Options are up to 40 characters, at most 20 per persona.
  - The database stores them as plain text lists, so no schema change was needed.
- **Why:** The owner asked for a way to add functions and seniority. The PRD's seniority
  list (8 levels) stays as the default set.

## D-019: Dependency warnings rechecked at v1.1.0

- **Date:** 2026-10-17 · **Status:** Accepted. Confirms D-014 for this release.
- **Decision:** `npm audit` reports the same 9 warnings as at v1.0.0 (`braces` in ESLint,
  esbuild in drizzle-kit). No packages were added in R2. None of them reach the live app.
  Recheck at v1.2.0.

## D-020: PRD open questions answered with the PRD's own assumptions

- **Date:** 2026-10-17 · **Status:** Accepted (the owner asked to proceed without stopping;
  any of these can be changed later)
- **Decision:**
  - **Deal value:** INR only, whole rupees, as in the data model. USD can be added later as a
    second field.
  - **Follow-up delays:** counted from the Message 1 date (days 4, 7, 10), as the PRD assumes.
  - **Funnel:** counts events dated inside the selected period (not a cohort), as the PRD
    assumes.
  - **Trial/Pilot:** kept as a stage, set from the stage dropdown.
  - **Who besides the default Admins is Admin:** decided in the app (Settings → Users).
- **Why:** These are the PRD's stated defaults. The owner asked for R3–R6 to be built
  back-to-back.

## D-021: Company names are unique; people link to companies by name

- **Date:** 2026-10-17 · **Status:** Accepted
- **Decision:**
  - Company names are unique, ignoring case and surrounding spaces. A unique index on the
    lower-cased, trimmed name enforces it.
  - On the person form you type a company name: an existing company is linked; otherwise a
    new one is created, owned by the lead's owner.
- **Why:** Prevents "Acme" and "ACME" becoming two companies, the same way LinkedIn links
  prevent duplicate people, and keeps adding a lead to one form.

## D-022: Dependency warnings rechecked at v1.2.0

- **Date:** 2026-10-17 · **Status:** Accepted. Confirms D-019.
- **Decision:** Same 9 build-time warnings (ESLint's `braces`, drizzle-kit's esbuild). No
  packages added in R3. None reach the live app. Recheck at v1.3.0.

## D-023: Getting ready to go online (R4)

- **Date:** 2026-10-17 · **Status:** Accepted
- **Decision:**
  - **Login attempt limiting (closes D-011):** after 5 wrong passwords for the same email in
    15 minutes, logging in to that email is paused for 15 minutes, with a plain message.
    Attempts are stored in the database (a `login_attempt` table), so it works on Netlify.
  - **Email (closes D-002's R4 item):** when `RESEND_API_KEY` and `EMAIL_FROM` are set, the app
    emails sign-up verification links, invites and password-reset links through Resend.
    Without them, it works as before: links are shown to the Admin, and sign-ups are
    verified at once. The QA checklist and deploy guide say to set them before going online.
  - **Sign-up verification (closes D-012's R4 item):** with email set up, a new @lumor.tech
    account can't log in until its owner clicks the link sent to that address (valid 24 hours).
  - **Deploying:** `netlify.toml` pins Node 22. Its build runs migrations,
    `releases:sync` and the build. `docs/deploy.md` gives the click-by-click Turso and Netlify
    setup. The owner creates the accounts; nothing is published automatically.
- **Why:** These were the items deferred to "before going online" in R1. Accounts and API
  keys can only come from the owner.
