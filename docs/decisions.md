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

## D-024: Dependency warnings rechecked at v1.3.0

- **Date:** 2026-10-17 · **Status:** Accepted. Confirms D-019 and D-022.
- **Decision:** Same 9 build-time warnings (ESLint's `braces`, drizzle-kit's esbuild). R4
  added Recharts, which brings no new warnings. None reach the live app. Recheck at v1.4.0.

## D-025: Dependency warnings rechecked at v1.4.0

- **Date:** 2026-10-17 · **Status:** Accepted. Confirms D-024.
- **Decision:** Same 9 build-time warnings. No packages added in R5. Recheck at v1.5.0.

## D-026: How the AI features run (R6)

- **Date:** 2026-10-17 · **Status:** Accepted
- **Decision:**
  - Claude Opus 5.5 (`claude-opus-5-5`) through the official Anthropic SDK, server-side only,
    with structured outputs (a fixed JSON shape checked by Zod), effort `low` for speed, a
    30-second timeout with no automatic retry (the screen offers Try again), and the
    server-side refusal fallback (`fallbacks: "default"`).
  - Today's AI ranking runs only when the rep clicks **Rank with AI**, not on every page load
    (PRD: AI runs only on a click). The rule-based list always shows first.
  - The pasted reply is saved before the AI call, so nothing is lost if the AI fails.
  - The AI refuses to run until Product Facts has "What Lumor does" and "Live features".
  - Browser tests use a stand-in AI (`AI_FAKE=1`), which only works with a local database file,
    so it can never switch on in production.
- **Why:** PRD AI rules (click-only, Product Facts only, 30 s timeout, degrade without
  blocking), plus predictable, free automated tests.

## D-027: Dependency warnings rechecked at v1.5.0

- **Date:** 2026-10-17 · **Status:** Accepted. Confirms D-025.
- **Decision:** Same 9 build-time warnings. R6 added `@anthropic-ai/sdk`, which brings no new
  warnings. None reach the live app.

## D-028: Version 2 starts at 2.0.0

- **Date:** 2026-10-18 · **Status:** Accepted (owner, D-033 F11)
- **Decision:** R7 is released as **v2.0.0** (a MAJOR bump), as the PRD says, because v2 changes
  the stage list and replaces the fixed sequence. After that it's MINOR per release again
  (R8 = 2.1.0, R9 = 2.2.0) and PATCH for fixes. CLAUDE.md's versioning line says so.
- **Why:** The PRD's v2 plan names v2.0.0; CLAUDE.md said MINOR per release, which would have
  made it 1.6.0.

## D-029: Migrating v1 data to v2 stages, with a backup

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:**
  - Migration 0005 maps stages exactly as the PRD table says: Request sent → Contacted;
    Connected and Messaged → Connected; Demo booked → Meeting scheduled; Demo done → Meeting
    done; Trial/Pilot → Trial; the rest unchanged.
  - Activity types Demo booked/held become Meeting booked/held. Past stage-change activities
    get a `to_stage` value read from their text.
  - The audit log is never changed: old entries keep the v1 names, which is a true record.
  - SQLite can't change a CHECK list in place, so person, activity, proposal and
    playbook_settings are rebuilt in one transaction (libSQL's migrate switches foreign keys
    off for it). Afterwards `PRAGMA foreign_key_check` must find nothing.
  - `npm run db:migrate` copies a local database file to `data/backups/` before applying any
    pending migration. Production (Turso): make a copy first (docs/deploy.md).
- **Why:** The PRD requires the migration; a backup makes it reversible.

## D-030: One guardrail module; block or warn

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:**
  - All cadence rules live in `src/server/plans/guardrails.ts`: `checkPlan` for the builder and
    `checkTouch` for single touches. The builder, quick-log, Today's Done and Snooze all use
    them, so they can't disagree.
  - Each finding is a **block** (refused, on the server) or a **warn** (the rep may choose "Log
    anyway"; the overridden rules go in the audit entry).
  - The values live in Playbook Settings.
- **Why:** The PRD says the builder blocks bad plans and Today warns before a rep breaks a rule
  by hand.

## D-031: How plan scheduling works

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:**
  - A step is due on the actual done date of the previous step plus its wait, in calendar days.
    With Skip weekends on, a Saturday or Sunday moves to Monday.
  - A date that would make a 3rd touch in 7 days moves later.
  - After a connection request the plan waits for Accepted. The withdraw task comes at day 14.
  - Pausing for a reply moves the time limit later by the days paused.
  - Finished and expired plans are worked out when a page is read; there's no background job.
- **Why:** The PRD's scheduling rules, with no scheduler needed until R9.

## D-032: The fixed sequence step is removed

- **Date:** 2026-10-18 · **Status:** Accepted (owner, D-033 F3)
- **Decision:** `person.sequence_step` is dropped in migration 0005. A plan's current step
  replaces it. Its history stays in the audit log. Quick-log no longer sets follow-up dates;
  plans do.
- **Why:** The PRD says plans replace F15's fixed sequence.

## D-033: Owner's answers on R7 (2026-10-18)

- **Date:** 2026-10-18 · **Status:** Accepted (owner)
- **Decision:**
  - **Seed plan:** 5 steps. Call and Follow-up 2 merge into step 4 at +7 days (Call if a phone
    is known → otherwise Email → otherwise LinkedIn message). Waits: Message 1 = 2 days after
    acceptance, then +4, +7, +10. Rule 2 is not relaxed for calls.
  - **Sixth touch** = a 5th follow-up after Message 1.
  - **sequence_step** removed (D-032).
  - **Channels:** a step has an ordered list of channel options, each with a condition (phone
    known / email known / always). There is no separate condition field.
  - **Skip weekends:** waits are calendar days rolled forward to Monday. Call retries use
    business days.
  - **Seniority:** optional on a person. Vice President or CXO get a 45-day plan limit; empty
    or anything else gets 30.
  - **Today:** withdraw is a plan task; the target bar stays; Stale only lists people not on a
    plan.
  - **Call outcomes** as proposed. Nurture is a date (`nurture_until`). The day-30 limit and
    "finished with no reply" give the same Nurture/Lost choice. When Nurture ends, Today shows a
    **Nurture check** task (enrol in a plan, or Lost).
  - **"In person"** stays as a channel for logging meetings, not for plan steps.
  - **Test date override:** only for local testing. It refuses to run unless the database is
    the local file, and never runs in production.
  - **v2.0.0** (D-028).
  - **R7 starts now;** the v1.5.0 QA checklist is done after R7, together with R7's exit check.
  - **Dashboard:** a simple per-plan and per-step reply-rate table in R7.
  - **Prompts:** P01–P04 go to v1.1 (v2 stage names, guardrail 6).
  - **"Contacted"** on the Dashboard = a person's first outreach touch of any kind in the
    period.
  - **Connection requests without a note** don't count as touches for rule 3 or rule 4; with a
    note they count.
  - **ends_by** counts from the acceptance date, or from the first touch when the plan doesn't
    start with a connection request; not from enrolment.
  - **Placeholders:** Done and Mark as sent are refused while any `{…}` is unfilled, with a
    message naming it.
  - **Quick-log on a plan:** a quick-log button that matches the current step's channel asks
    "Is this step N of their plan?" Yes advances the plan; No logs an extra touch, checked by
    the guardrails.
  - **Pace:** R7 is built in one go; ask only if a decision would change the PRD or this
    record, if data could be lost, or if blocked.
- **Why:** The owner's answers to the R7 plan's flags.

## D-034: Choices made while building R7

- **Date:** 2026-10-18 · **Status:** Accepted
- **Decision:**
  - **What counts as a touch:** a connection request with a note, a LinkedIn message, an
    InMail, an email, a WhatsApp message, or a call that **connected**. Calls with no answer
    don't count. Otherwise the PRD's next-business-day retries would break rules 2 and 4.
  - **Which guardrails apply to which plans:** rules 1–4 and 7 apply to **Outreach** plans
    (people who haven't replied). Meeting follow-up, Trial and Onboarding plans run after a
    conversation has started, so only rules 5, 6 and 8 apply to them.
  - **Templates for steps:** a step names a template purpose. The app picks the best active
    template for the person: one for their persona and level first, Official before Personal,
    then any active template with that purpose.
  - **Wrong number** removes the phone number from the person. The number stays in the call
    activity text, so the change is recorded.
  - **A finished plan stays Active** (with no next step) until the rep chooses Nurture or Lost
    on Today, so the person can't be enrolled twice in the meantime.
  - **Plan steps move the stage forward only:** a person's first outreach moves Prospect →
    Contacted; acceptance → Connected.
  - **Replies are linked to the plan and step** that came just before them, for the
    per-step reply rate.
  - **"Sixth touch" in the exit check:** after D-033 merged the call into step 4, the seed
    plan has 3 follow-ups after Message 1. Adding one more step is refused by guardrail 7 (the
    plan would run longer than 30 days). Adding two is also refused by guardrail 3 (a 5th
    follow-up). The exit check shows both.
  - **The test date switch** lives on the About page, as a cookie. It shows only when the
    database is a local file, and the server refuses it otherwise.
- **Why:** Gaps the PRD doesn't cover; none changes what the PRD or D-033 says.

## D-035: Dependency warnings rechecked at v2.0.0

- **Date:** 2026-10-18 · **Status:** Accepted. Confirms D-027.
- **Decision:** Same 9 build-time warnings (ESLint's `braces`, drizzle-kit's esbuild). R7 added no
  packages. None reach the live app. Recheck at v2.1.0.

## D-036: The AI features use OpenAI instead of Anthropic

- **Date:** 2026-10-18 · **Status:** Accepted (owner). Replaces the model and provider part of
  D-026; everything else in D-026 still applies.
- **Decision:**
  - All four AI features (Today's Rank with AI P01, Reply Assistant P02, Summarise P03, Draft
    P04) call **OpenAI** through the official `openai` library's Responses API, from one file
    (`src/server/ai/client.ts`). The prompts (P01–P04 v1.1), structured answers checked with
    Zod, the 30-second limit with Try again, the Product Facts requirement and the stand-in AI
    for tests are unchanged.
  - Default model **`gpt-5.5`**: the newest general model on the account with a fixed, dated
    version (2026-04-23), with reasoning effort `low` to stay well inside 30 seconds. A test
    call on the Reply Assistant prompt answered in about 8 seconds and followed the guardrails.
    `OPENAI_MODEL` can name another model without a code change.
  - The key lives only in `.env.local` (locally) and Netlify's environment variables
    (production) as `OPENAI_API_KEY`. `@anthropic-ai/sdk` is removed.
  - CLAUDE.md's stack line now says OpenAI API. The PRD's stack table still says Anthropic;
    CLAUDE.md wins (it points here).
- **Why:** The owner chose OpenAI for all AI features and provided the key.

## D-037: AI Resources replaces Product Facts (owner, 2026-10-22)

- **Date:** 2026-10-22 · **Status:** Accepted (owner: "go with your recommendations")
- **Decision:**
  - A new **AI Resources** page (F20) holds the AI knowledge base: the owner's Markdown files,
    which become the only facts the AI may use. Each prompt reads the files the knowledge
    base's README assigns to it, with the guardrails file placed last. This **replaces Product
    Facts** (F12); only its calendar link is kept, moved to AI Resources.
  - **Admins only** change AI knowledge and add or remove sales resources; everyone reads and
    downloads.
  - Sales resources are PDF, JPG, PNG, MD or MP4 files **up to 5 MB**, stored in the app's
    database (no new storage account), or **links**. Videos and large decks go in as links,
    because the online host (Netlify) can't take uploads over about 6 MB.
  - The AI reads the **Markdown knowledge files only**, not PDFs, images or videos.
  - Prompts P01–P04 move to **version 1.2**: they read the KNOWLEDGE BASE instead of Product
    Facts, and the Draft prompt now leaves an unknown placeholder visible and tells the rep, as
    the guardrails file says. The app still refuses to log a message with an unfilled `{…}`.
  - **Release numbering:** this ships as **v2.1.0**, before R8. R8 Conversations becomes
    **v2.2.0** and R9 Reports **v2.3.0** (the PRD's release plan said 2.1.0 and 2.2.0;
    CLAUDE.md follows this record).
- **Why:** The owner's knowledge base is more complete and better governed than the Product Facts
  form, and reps need one place for decks and videos.

## D-038: Conversations: who, where and when for every message (owner, 2026-10-22)

- **Date:** 2026-10-22 · **Status:** Accepted (owner answered the R8 questions)
- **Owner's choices:**
  - Build the conversation thread now, as R8 (v2.2.0), with the Team tab the PRD puts in R8.
  - Messages can be added **one at a time** and by **pasting a whole conversation**, which the
    AI splits for the rep to review before saving.
  - A message dated in the past **re-plans quietly**: no warning.
  - **Reply Assistant becomes "Suggest next message"**, which also works when the prospect
    hasn't replied.
  - Every message records its **source**: LinkedIn, email, phone call or an in-person meeting
    (plus InMail and WhatsApp, which the app already has), so the order of the whole
    conversation is clear.
- **My choices (within the PRD):**
  - A new `activity.direction` column (`out`/`in`) says which side a message is on; the
    migration fills it for old rows. "From me" in person is a Meeting note on the rep's side;
    "From them" on any channel is a Reply received.
  - An earlier "From me" entry is history: no guardrail warnings (Do not contact still
    refuses). Today's entries keep the warnings. Pasted conversations never ask "Is this step
    N?"; their outbound rows are extra touches.
  - The app, not the AI, works out the situation (reply, wait, nudge, close the loop, start),
    so the advice is predictable; the AI writes the words.
  - The AI's reply type is saved on the reply when it had none (before, it was only saved if
    the rep changed it, so the Dashboard's Interested count missed it).
  - New prompt **P05 Split conversation** (no knowledge base needed: it only reads the pasted
    text). The optional AI summary in F19 Reports becomes **P06**. P02 goes to v2.0 (new
    name and output), P03 and P04 to v1.3 (they read the thread).
  - The nudge count lives on the person (`nudge_count`), reset by any reply.
  - "Done today" on the Team tab counts outreach steps and calls, messages, withdrawals and
    meetings held logged by that rep today.
- **Why:** The AI could only see what was logged, and messages the rep sent were often logged
  without their text or time. Recording each message's side, channel and time gives the AI and
  Today the real conversation.

## D-039: Reports: email first, print-to-PDF, AI summary on request (owner, 2026-10-30)

- **Date:** 2026-10-30 · **Status:** Accepted (owner answered the R9 questions)
- **Owner's choices:**
  - **Set up email (Resend) before building**, so scheduled reports are tested end to end.
  - **PDF = a print-ready report page** saved with the browser's Save as PDF. No PDF library is
    added; emails link to the saved report instead of attaching a file.
  - **AI summary on request:** a "Write AI summary" button; scheduled reports include it
    automatically when AI is set up.
- **My choices (within the PRD):**
  - Reports are **saved snapshots** (JSON), so a saved or emailed report never changes later.
  - Quarters and half-years follow the **calendar** (Jan–Mar, Jan–Jun). Easy to switch to the
    Indian financial year (Apr–Mar) if the owner prefers.
  - Scheduled runs: a Netlify scheduled function every 15 minutes calls `/api/cron/reports`
    with a new secret, `CRON_SECRET`, so the app code runs inside Next.js and the route is
    closed to everyone else. Daily schedules cover that day; the others cover the previous
    full period.
  - Plan adherence needs each step's due date, which wasn't stored: `activity.plan_due_date` is
    saved from R9; older steps show as "not recorded".
  - The AI summary is **P06** (P05 is Split conversation, D-038). It reads only the report's
    numbers, nothing goes to a prospect, so like P05 it carries no prospect guardrails.
  - New permissions: `reports.team` (report on the team or anyone) and `reports.schedule`
    (manage schedules), both Admin only. Anyone can report on themselves.
- **Why:** Matches the PRD's F19 with the least new machinery: no PDF service and no file
  storage, and the email key the owner is adding now.

## D-040: The owner's first live QA round (owner, 2026-10-30)

- **Date:** 2026-10-30 · **Status:** Accepted (owner listed the changes; asked for them done
  without further questions)
- **Owner's requests, as built:**
  - **Every person needs a company**, picked from existing companies (with **+ Add a new
    company**). **Add person** on a company page. **Editable company notes.**
  - **Delete and merge companies; delete people.**
  - **An Industries list** with add, edit and delete (new feature F21, on Settings).
  - **The Lumor icon** in the top-left instead of the full logo (keeping "Sales Hub"), and as
    the browser tab icon (it was Next.js's default icon). One file, `public/brand-icon.png`.
  - **Adding people counts as new outreach** on Today.
  - **Login after a password reset**, **My leads / All leads**, and **AI features** fixed.
- **My choices:**
  - Deleting and merging are **Admin only** (`lead.delete`): they remove data. A company can
    only be deleted once it has no people; merging keeps everything.
  - "Counts as new outreach": each person a rep **adds** today, or sends a connection request
    to today, counts **once** toward the daily target (previously only connection requests).
  - Industries: anyone adds (so reps aren't blocked adding a company); Admins rename and
    delete, and the change follows through to companies and account filters.
  - Reset login: a successful reset or change now clears the 15-minute pause from earlier
    wrong passwords, and counts as confirming the email (with email switched on, unconfirmed
    accounts were refused even with the right new password).
  - My leads / All leads worked correctly in a browser test; the slowness on the live site
    comes from each page's database round trips (the database is in Mumbai). The tabs now show
    a loading dot at once. Moving the database and the site's functions to the same region is
    an owner step (docs/deploy.md).
  - AI: the key was valid, but the OpenAI project only allows `gpt-5.4-nano`, and the app
    showed that as "key refused". Now the app falls back to the best model the project allows
    (preference list in `src/server/ai/client.ts`) and logs which one; the owner can allow
    `gpt-5.5` in OpenAI for better answers.
  - **Version 2.4.0** (MINOR): this round adds features (merge, delete, industries), not only
    fixes. The F21 doc was written alongside the code rather than before it.

## D-041: Calendar, AI chat and Fill with AI (owner, 2026-11-02)

- **Date:** 2026-11-02 · **Status:** Accepted (owner approved the plan: "go ahead")
- **Owner's requests:** a Calendly-like calendar with booking links (F22); a chat with the AI on
  each person instead of one-shot suggestions (F23); a button that researches and fills the
  company and person forms (F24); Companies above People in the sidebar; their logo.
- **Owner's answers to my three questions (all my recommendations):** the calendar works on its
  own first (slots only from the hours set; invites by email), Google Calendar sync later; every
  rep has their own calendar and links; Fill with AI with web search for everyone.
- **My choices:**
  - **Public booking without a login.** `/book/…` and `/booking/…` are the only places data
    changes without a signed-in user. Instead of requireUser() and assertCan(), each change is
    checked against the meeting type's link (must be on, slot must be free) or the booking's
    private code (a random 32-character code), and audited in the same transaction with the rep
    as the actor and "via booking page". At most 3 bookings per email per day, plus a spam trap
    field.
  - **New people from bookings only with a LinkedIn profile**, because every person needs one
    (it's how duplicates are stopped). Otherwise the booking offers **Add as person**.
  - **Times:** hours are set in IST (the app's rule); the booking page shows the visitor's own
    time zone. Slots every 15 minutes for meetings up to 20 minutes, otherwise every 30.
  - **Double bookings** are blocked twice: the slot is re-checked inside the saving transaction,
    and a unique index stops two confirmed bookings at the same start for one rep.
  - **Invites** are standard calendar files (.ics) attached to Resend emails, and downloadable
    from the confirmation page, so booking works even without email set up.
  - **AI chat replaces Suggest next message on the person page**; Today keeps its one-click
    suggestion (P02 unchanged). Chats are private to their author, Admins included; the audit
    entry records the message count, not the text.
  - **Fill with AI** fills only empty fields and never saves by itself. Low confidence fills
    nothing. It uses OpenAI's web search tool (searching from Bangalore); if the project's model
    can't search, it falls back to the model's own knowledge and says so. 60-second limit.
  - **New prompts P07 (chat), P08 (fill company), P09 (fill person).** P07 carries the prospect
    guardrails for drafts. P08 and P09 don't write to prospects, so they don't.
  - **New permission `calendar.manage`** (every active user, own calendar; Admins anyone's).
  - **Version 2.5.0** (MINOR): new features.

## D-042: Calendar round 2: questions, notifications, teammates, calendar view, Google Meet (owner, 2026-11-02)

- **Date:** 2026-11-02 · **Status:** Accepted (owner's list; "complete the entire task" without
  questions, see the standing preference)
- **Owner's requests:** question types and more questions; more hours per day, and availability
  changes that clearly reach the booking page; a booking email to the rep at an address they
  choose; booking pages that never lead into the app; a stricter booking form (email check,
  phone with country flags, no default questions, required stars, footer "Lumor"); IST shown
  with a time zone dropdown; automatic Google Meet links; a notification bubble; a friendly,
  responsive booking page; a proper month/week/day calendar; teammates on a meeting; every rep
  sees everyone's meetings; notifications and emails for cancels and reschedules.
- **My choices:**
  - **Question types:** Short answer, Paragraph, Dropdown (pick one), Checkboxes (pick any).
    Dropdowns and checkboxes have 2–20 options. Up to **10 questions** per meeting type. Old
    questions read as Short answer, so nothing needs migrating. Checkbox answers are stored as
    one line ("A, B").
  - **Length:** the presets plus **Custom** (5–240 minutes, in steps of 5).
  - **Availability:** up to 12 ranges a day. The availability bug report: the slot rules were
    right (a 30-minute meeting in 11:00–11:30, 12:00–12:30, 13:00–13:30 offers 11:00, 12:00 and
    13:00), but a meeting longer than every range offers nothing, silently. Now Availability
    shows **what people will see** (the next free times for each meeting type) and warns when a
    meeting type fits in none of a day's ranges.
  - **The rep's notification email:** set on Availability (defaults to their login email).
  - **Booking pages never show the app:** a public "link not found" page with no app links, for
    wrong rep names, meeting types and booking codes, and for extra parts added to the address.
  - **Booking form:** the free-text note is gone (only the meeting type's own questions show);
    required fields have a red star; email must have a domain with a dot (name@company.com,
    .in, .tech…), not literally ".com", because Indian and tech companies use other endings;
    phone is optional but, when given, needs a country (flag dropdown, India first) and must be
    a valid number for it (checked with the libphonenumber-js library); stored as +91 98765 43210.
  - **Time zones:** the booking page starts in **India Standard Time (IST)**, as asked, with a
    dropdown of every time zone. A visitor whose browser is elsewhere gets a one-click "Use my
    time zone (…)" so they don't misread IST times.
  - **In-app notifications** (new F25): a bell with the unread count in the sidebar and a count
    on Calendar. A notification for: a new booking, a cancellation, a reschedule, being added
    to or removed from a meeting. Marking them read is audited like every other change (one
    entry per "mark all read"). Each one also emails the rep's notification address.
  - **Teammates on a meeting:** the host, anyone already on the meeting, or an Admin can add or
    remove other active reps. A teammate's meetings block their own booking pages too. Adding
    shows a warning if the teammate is busy then, but still allows it.
  - **Transparency:** every signed-in rep sees everyone's meetings on the calendar (filter:
    Everyone / Just me / one rep). Cancelling, rescheduling and adding people stay with the
    host, the meeting's teammates (add/remove only) and Admins.
  - **Rep reschedule:** the host or an Admin can move a meeting to another free time; the
    person who booked gets a new email with the new manage link.
  - **Google Meet (new F26):** each rep can **Connect Google Calendar** (Google's sign-in, their
    own account). Then each booking creates an event in their Google Calendar with a fresh Meet
    link, invites the person who booked and the teammates, and moves or cancels with the
    booking. The rep's Google busy times block their booking slots too (this fixes the "no
    Google sync" caveat of v2.5.0). When Google is connected the invite comes from Google, so
    our email doesn't attach a second calendar file. Without a connection, everything works
    as before (the meeting type's own "Where" link, and our calendar file).
    - Google needs a one-time setup by the owner (a Google Cloud OAuth client; steps in
      docs/deploy.md). New variables GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
    - The rep's Google refresh token is stored encrypted (AES-256-GCM, key derived from
      BETTER_AUTH_SECRET), never shown, and revoked on Disconnect. Changing BETTER_AUTH_SECRET
      means reps reconnect.
    - Scopes: `calendar.events` (create/move/cancel events) and `calendar.freebusy` (busy
      times only, not event details). If Google refuses the busy check, slots fall back to the
      app's own bookings.
    - If Google fails while booking, the booking still stands; the rep gets a notification to
      add a link themselves.
  - **Calendar view:** month, week and day views built in the app (no new calendar library),
    in IST, with the old list kept as a "List" view.
  - **Booking emails** gain a simple HTML layout, the Meet link and the manage link.
  - **"Booking session"** in the owner's list is read as: every booking creates a calendar
    event with its own meeting link (F26).
  - **Version 2.6.0** (MINOR): new features.

## D-043: Owner's list of 2026-11-03: events, reminders, booking sync, Calendly, backlogs, plans, reports

- **Date:** 2026-11-03 · **Status:** Accepted (owner's list of 12 points; "complete everything"
  without questions, see the standing preference)
- **Owner's requests:**
  1. "Meeting type" becomes "event" everywhere.
  2. Reminders by email to the person who booked, so email is always collected and comes first.
  3. The phone country shows "IN +91" once picked.
  4. The standard fields (name, email, company, phone, LinkedIn) appear on every new or edited
     event and can be made required or optional. No "* Required" line at the bottom.
  5. The Lumor logo on the booking pages.
  6. A required checkbox question said "Pick from the choices given" even when ticked.
  7. A booking didn't reach the calendar, notifications or email. The owner's email copy, and
     the Calendly integration instructions.
  8. Calendar filter aligned, no "Everyone", the signed-in rep by default. Reps schedule a
     meeting themselves, with To and CC recipients emailed.
  9. Today shows backlogs, and Snooze asks for a date. A backlog indicator on People and
     Companies. Team tab counters rechecked, with details behind each number.
  10. Plans: add and delete steps; "channel" becomes "task", with a Custom task and a custom
      template purpose; plans reach Today. No approvals: people create their own plans.
  11. Reports: choose who they're emailed to; see reports others sent you; a consolidated
      report (people and companies added, outreach, status, replies, conversions, no
      response, per rep) as a PDF with charts.
  12. Each event asks "online or in person" by default. After booking, the person only sees
      the confirmation and can only cancel or reschedule.
- **My choices:**
  - **Words:** in the app the rep sees **Events** (Calendar → Events, **New event**); a booking
    made from an event is still a **meeting**. The database keeps its names (`meeting_type`).
    The old address /calendar/meeting-types forwards to /calendar/events.
  - **Booking form fields (point 4):** every event has a **Booking form** section listing, in
    order: Work email, Your name, Company, Phone, LinkedIn profile, How to meet (online or in
    person), then the event's own questions. Email and name are always shown and required
    (email for the confirmation and reminders, the name for the record), so their switches are
    locked. The others each have **Show** and **Required**. Defaults for a new event: company
    shown and required, phone and LinkedIn shown and optional, how to meet shown and required.
    Existing events get the same defaults (so nothing they showed disappears). Up to 10 own
    questions as before.
  - **Online or in person (point 12):** online = Google Meet when the rep has Google connected,
    otherwise the event's meeting link. In person = the event's new **In-person address**; when
    it's empty, the confirmation says the rep will confirm the place. No Meet link is made for
    in-person meetings. When **How to meet** is hidden, every meeting is online.
  - **The checkbox bug (point 6):** choices are now matched ignoring spaces, case and accents
    on both sides, and a choice that isn't on the list (for example, a page opened before the
    event was edited) is dropped rather than refusing the booking. "Pick at least one" still
    applies when nothing valid is left. A browser test books with a required checkbox question.
  - **Why the owner's booking went nowhere (point 7):** the checkbox error stopped it from
    being saved, so there was nothing to show, notify or email. Booking emails also need
    RESEND_API_KEY and EMAIL_FROM on Netlify (checked on the QA list).
  - **Emails (point 7):** the owner's copy is used word for word (docs/email-templates/). Two
    new event fields fill it: **Name in emails** ("Lumor demo"; defaults to the event name)
    and **Note in emails** (the "To get the most from…" paragraph). A new Availability field,
    **Your title in emails** ("Co-founder, Lumor"), fills "With:". Reminders go **24 hours** and
    **1 hour** before, by the scheduled job that already runs every 15 minutes (now also for
    reminders); the 24-hour one only when booked more than a day ahead, the 1-hour one only when
    booked more than 2 hours ahead. They carry a **Choose a new time** link, so each booking now
    keeps its private manage code encrypted (AES-256-GCM, like Google tokens), not just its
    hash. Bookings made before 2.7.0 get reminders without that link.
  - **Booking sync (point 7, the owner's Calendly rules, applied to our own booking page too):**
    - Find the person by email, then by name + company, then by LinkedIn.
    - Found: log **Meeting booked** with the date, the meeting link and the answers; move them
      to **Meeting scheduled**; **pause their plan**; the meeting shows on Today that day.
    - Not found: create the person, owned by the event's rep (from Calendly: by the default
      Admin, as instructed), with a **Check details** flag shown on their page until someone
      clears it.
    - Cancelled: log it with the reason, stage back to **Replied**, **resume the plan**.
    - Rescheduled: one **Meeting moved** note, and Today's meeting date moves.
    - The rep's email uses the owner's copy, with **Open in Sales Hub** to the person's page.
  - **People without LinkedIn:** to create people from bookings, a person now needs **a
    LinkedIn profile or an email** (previously LinkedIn was required). The duplicate check
    still runs on LinkedIn when there is one, and on email otherwise.
  - **Calendly (new F27):** a webhook at /api/calendly/webhook for `invitee.created` and
    `invitee.canceled`, verified with CALENDLY_WEBHOOK_SIGNING_KEY (HMAC-SHA256, 5-minute
    window), each event handled once. A reschedule (Calendly sends a cancel marked
    "rescheduled", then a new booking) is one **Meeting moved**. The company comes from a
    booking question mentioning "company"; otherwise the email's domain (not for free email
    services, which read "Not given"). Setting up the webhook on Calendly's side needs a paid
    Calendly plan; the steps are in docs/deploy.md.
  - **Calendar page (point 8):** the person filter lines up with the view buttons; it lists
    the reps only, starting on the signed-in rep (Admins and reps alike can pick anyone).
  - **Schedule a meeting (point 8):** a button on the Calendar page. Title, date, start time,
    length, how to meet (Google Meet, in person, phone, or another link), place or link, **To**
    and **CC** email addresses (up to 20 each), and an optional message. It's saved as a
    meeting on the rep's calendar (with Google Meet when connected) and emailed to To with CC
    copied. Saved through a hidden per-rep "Scheduled meeting" event, so it works with
    teammates, reschedule and cancel like any other meeting. Linked to a person when the first
    To address matches one.
  - **After booking (point 12):** the confirmation page shows the success message, the details
    and the Join button, and only **Reschedule** and **Cancel**. The "add to calendar" buttons
    are gone: the email brings the invite.
  - **Logo (point 5):** the owner's logo (mark and wordmark) at the top of every public page and
    in the footer, and in the booking emails' header.
  - **Phone (point 6 of the form, point 3):** the closed country box shows "🇮🇳 IN +91"; the open
    list keeps full names.
  - **Today backlogs (point 9):** a new first section, **Backlog**: anything that was due on an
    earlier day and isn't done (a reply not answered, a meeting not marked held, a recap not
    sent, a nudge, a plan step, a withdraw), each with "due {date} · {n} days late". Today's
    own work follows in the usual sections. The old "Overdue steps" section is part of Backlog.
  - **Snooze (point 9):** Snooze asks for a date (Tomorrow, In 2 days, Next Monday, or pick
    one; up to 60 days). On that date the task comes back as due that day, not as a backlog.
    Plan steps snoozed to a date still respect the weekly touch limit.
  - **Backlog on People and Companies (point 9):** a red **Backlog** badge on the person's row
    and page, a "Backlog only" filter on People, and a Backlog count (people with a backlog) on
    Companies.
  - **Team tab (point 9):** the counters are the same rules as each person's My day: **Due
    today**, **Backlog**, **Meetings today** (calendar), **Done today**, **On active plans**,
    **Replies waiting over 1 day**. The zeros the owner saw were real: "Due today" left out
    overdue work, which now shows under Backlog, and calendar meetings weren't counted. Each
    number opens the list behind it.
  - **Plans (point 10):** steps could already be added, removed and moved; that stays, with
    clearer buttons. "Channel" reads **Task** in the builder. The task list gains **Custom**:
    type a name (for example "Send a case study"); a custom task works like Manual task, and
    names used before appear in the list for everyone. **Template purpose** gains **Custom** the
    same way (no template is picked for a custom purpose; the rep writes the message).
    **Saving a changed plan** asks whether to move the people already on it to the new version
    (their current step and due date stay).
  - **No approvals (point 10):** the Approvals page and the Propose buttons are gone. Anyone can
    create **Official** (the team's) or **Personal** plans, personas, account filters and
    templates; an Official item can be edited by its creator or an Admin. Proposals waiting at
    the upgrade stay as Personal items; their creator can switch them to Official. The `proposal`
    table and its history are kept (audit).
  - **Reports (point 11):**
    - **Email to:** the Make a report form takes teammates (ticked) and any other email
      addresses; Generate saves the report and emails it, with the PDF attached, to all of them.
      A saved report can be emailed again from its page.
    - **Shared with me:** teammates a report is sent to get a notification and can open it.
      Report history has **Made by me**, **Shared with me** and (Admins) **All**. Scheduled
      reports share with the Admins or reps they're sent to.
    - **Consolidated content:** a new first section, **Pipeline**, per rep and in total: people
      added, companies added, new outreach (people contacted for the first time), replied,
      converted, no response yet (contacted in the period, no reply so far), and where their
      people stand now (by stage).
    - **PDF with charts:** the PDF is now made by the app (jsPDF, a small library that runs on
      the server; this replaces D-039's print-only PDF), with charts for outreach per rep, the
      funnel and people by stage. **Download PDF** downloads it; the print view stays.
  - **Pushing:** each push to GitHub costs a Netlify deploy (see the credits note on 2026-11-03),
    so this work is committed after each step but pushed once, at the release.
  - **Version 2.7.0** (MINOR): new features.

## D-044: Today shows every person's next action until they're converted or lost (owner, 2026-11-03)

- **Date:** 2026-11-03 · **Status:** Accepted
- **Owner's request:** People showed five overdue next actions, but Today said "Nothing due".
  Today must list every person's follow-up until they're converted or lost: a next action that's
  due or overdue always shows (overdue ones stay until dealt with), and a person in an active
  stage with no follow-up date shows too, so nobody is forgotten.
- **Why it happened:** Today only read two next actions ("Hold meeting" and "Send recap"); any
  other next action ("Send message", "Call him…") was ignored unless the person was on a plan.
- **My choices:**
  - **Follow-ups due** (new section): any next action whose date is today or earlier, whatever
    its words, for people not converted, Paid, Active customer, Lost or Do not contact. Overdue
    ones go to **Backlog** like everything else (D-043).
  - **Needs a follow-up date** (new section, near the end): people in Contacted, Connected,
    Replied, Meeting scheduled, Meeting done, Proposal sent or Trial with no next-action date
    and nothing else on Today. (Prospects without a date are still covered by Stale leads.)
  - **Plans come first:** someone on an active plan follows the plan's dates (a step due, or
    waiting for acceptance). A **paused** plan (they replied) no longer hides them: their next
    action shows.
  - **Buttons:** **Set next follow-up** (what and when, today or later; audited) on both new
    sections, plus Snooze and Open. Logging what you did stays on the person's page.
  - The Team tab and the Backlog badges use the same rules, so they count these too.
  - **Version 2.7.1** (PATCH): a fix to Today.

## D-045: Owner's list of 3 November, round 2: plans, calendar, guests, Today meetings (owner, 2026-11-03)

- **Date:** 2026-11-03 · **Status:** Accepted
- **Owner's requests and my choices:**
  1. **Plan panel:** the Enrol/Switch button lines up with the plan dropdown.
  2. **Calendar badge:** the sidebar's Calendar number now means **meetings you have today**;
     notifications (including new bookings) live only on the bell. Meetings of 30 minutes or
     less show time and title on one line in the week and day views, so the title isn't cut.
  3. **Event links:** a new event gets a random 8-character **link code** (e.g.
     /book/somnath/k7m2q9xa) that never follows the name, so renaming an event keeps links that
     were shared. It can still be edited. Existing events keep their links.
  4. **Missing slots:** the slot rules match the weekly hours; times disappear because of
     Google Calendar busy times (any event marked Busy, including all-day ones), meetings and
     their gaps, and minimum notice. When Google can't be read, its busy times are ignored, so
     slots can come and go. Availability now has **Why some times are missing**: each of the next
     7 days with your hours, what took time out (and why), and the times offered per event, plus
     a warning when Google couldn't be read. On the booking page, days that can't be booked
     (past days, days without hours, full days) have a subtle red background and red text.
  5. **Meeting pop-up:** the Add button is just "Add". The dropdown ends with **Custom: any email
     address…** to add anyone (client, colleague) as a guest. Guests join the Google event
     (Google emails them) or, without Google, get our invitation with a calendar file; they're
     kept with the meeting's CC list, can be removed, and stay when it moves. The pop-up closes
     at once instead of waiting for the page.
  6. **Today:** **Your meetings** lists today's meetings and the next 7 days, each with **Join**
     (when there's a link) and **Details** (opens it on the calendar).
  7. **Plans:** no Archive and no approval leftovers. The seeded plans lose "(draft)" and become
     ordinary Official plans (migration 0015). Tabs: **All plans** (default), Official, **Made by
     me**. **Delete** replaces Archive: an unused plan is removed for good; a plan people have
     been on leaves every list and their live plans stop ("Plan deleted"), so timelines keep
     their history.
  - **Version 2.7.2** (PATCH).

## D-046: Email through a Gmail account, without buying a domain (owner, 2026-11-03)

- **Date:** 2026-11-03 · **Status:** Accepted
- **Owner's request:** send the app's emails without using lumor.tech and without buying a
  domain; a Gmail account is fine.
- **Why a change was needed:** Resend (D-023) only sends from a domain you own, and gmail.com
  can't be verified there.
- **My choices:**
  - **New option: Gmail.** The app sends through Gmail's mail server (smtp.gmail.com) with a
    Gmail **App Password**, using the nodemailer library (10.1.7, pinned). This is a stack
    change, recorded here.
  - New variables `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` (the 16-letter app
    password, not the normal password). When both are set, Gmail is used. Otherwise Resend, as
    before, when `RESEND_API_KEY` is set. Without either, no emails (as before).
  - **From:** Gmail only sends as the account itself, so the sender is `EMAIL_FROM` when it uses
    that address, otherwise "Lumor <the Gmail address>". **Replies** still go to the rep
    (Reply-To), as with Resend.
  - Advice to the owner: use a separate Gmail account for the Sales Hub, not a personal one
    (prospects see the address). Gmail's limit (about 500 emails a day) is far above our use.
  - Everything else (calendar files, PDFs, CC) works the same.
  - **Version 2.7.3** (PATCH).

## D-047: Booking emails, the booking page in steps, taken times, missing slots (owner, 2026-11-03)

- **Date:** 2026-11-03 · **Status:** Accepted
- **Owner's findings and my choices:**
  1. **"Invitation from an unknown sender" with no content, from "Somnath Chakravarti":** that
     was Google Calendar's own invite, sent from the rep's Google account because we asked
     Google to email the guests (`sendUpdates=all`). Now Google never emails anyone
     (`sendUpdates=none`); Lumor's branded emails go instead, each with the calendar file
     attached (the host's own copy is in their Google Calendar). Google still keeps the event
     and its Meet link.
  2. **Subjects** start with the event's title, then the date: "Lumor demo: … · Wednesday 4
     November at 3:00 pm" (also moved, cancelled and invitations). The body keeps the owner's
     wording under a "You're booked" heading.
  3. **Sender name and avatar:** the sender is "Lumor <the Gmail address>" (D-046). The round
     picture in people's inboxes is the sending Gmail account's own profile photo, which the
     app can't set: the owner sets the Lumor icon (public/lumor-icon-512.png) as that
     account's photo. The icon is saved in the app as public/lumor-icon.svg.
  4. **The rep got no email:** booking emails were going nowhere (email wasn't set up, or was
     failing). Rep emails already go to each rep's own address (their booking-email address,
     or their login email), so they follow whoever's booking link was used. New: **Send me a
     test email** on Availability, which says how emails go out and, if sending fails, why
     (for example a wrong App Password).
  5. **Taken times:** booked meetings, meetings a rep schedules themselves and meetings they're a
     teammate on are never offered. New: after saving a booking the app checks again for any
     overlapping meeting in the same transaction and refuses the second of two people booking at
     once.
  6. **Missing slots:** the rules offer every start the hours allow, every 30 minutes (every 15
     for meetings of 20 minutes or less). Times go missing because of the minimum notice, a
     booked meeting, its **gap** (a 10-minute gap after a 12:00 meeting also hides 11:30 and
     12:30), Google Calendar busy times, or the day's limit. Now: new events start with **no
     gap**; the Availability report lists **every missing time with its reason**; and a switch
     on Availability lets a rep stop using Google busy times for booking (migration 0016,
     `calendar_profile.use_google_busy`, default on).
  7. **The booking page in steps (phone and desktop):** 1) the introduction (who, the event,
     how long, how to meet, the description) with **Choose a time**; 2) the day and time, with
     the **time zone at the top** (India Standard Time unless changed); 3) the details form.
  - **Version 2.7.4** (PATCH).
