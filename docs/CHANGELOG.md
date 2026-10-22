# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]` (skipped by the sync).
- Each release: a `## [X.Y.Z] - YYYY-MM-DD` heading, one summary sentence, then `- ` bullets.

## [Unreleased]

AI Resources (v2.1.0), in progress; then R8 Conversations (v2.2.0).

- Feature doc written for AI Resources (F20); decision D-037. The owner's AI knowledge base is stored in docs/ai-knowledge/.
- New **AI Resources** page (sidebar). AI knowledge: the 8 starting files about Lumor, which the AI may only quote from; Admins add or edit files (each change keeps the old version and is in the history) and set the demo calendar link. Sales resources: Admins upload decks, images and short videos (PDF, JPG, PNG, MD, MP4 up to 5 MB) or add links; everyone opens and downloads them.
- Product Facts is replaced by AI Resources; its old page now opens AI Resources.
- All four AI prompts move to v1.2 and read the knowledge files (guardrails file last). Draft message leaves a placeholder it can't fill visible and tells the rep, instead of making one up.

- All AI features (Today's Rank with AI, Reply Assistant, Summarise conversation, Draft message) now run on OpenAI (default model gpt-5.5, or the one in OPENAI_MODEL). Same prompts, guardrails and screens. Set OPENAI_API_KEY to turn AI on.

## [2.0.0] - 2026-10-18

R7 Plans: version 2 starts. New stages, Plans with cadence guardrails and the seed Official Outreach plan, and a Today driven by plans.

- PRD Version 2 scope added. Feature docs written for Plans (F17) and the plan-driven Today (F08 v2), with placeholders for F18 and F19; decisions D-028 to D-034.
- Stages renamed for v2 (Contacted, Meeting scheduled, Meeting done, Trial; new Proposal sent and Active customer). Existing people and activities are migrated automatically, with a backup of the database file made first.
- People get phone, email, seniority and Do not contact (with a reason). Do not contact blocks outreach.
- Quick-log buttons for v2: Message sent on any channel, Call with its outcome, Meeting booked and held, Proposal sent. Follow-up dates now come from plans.
- Playbook Settings: the follow-up delays are replaced by the cadence guardrail values.
- Seed plans: the Official Outreach plan (5 steps), plus Meeting follow-up, Trial and Onboarding drafts waiting for Admin approval.
- Cadence guardrails and plan scheduling rules (weekends skipped, late steps shift later ones, the weekly touch limit, call retries, pausing), with tests for every rule.
- New **Plans** page (sidebar): Official and Personal plans, a step-by-step builder that checks the guardrails as you type, versions (people keep the version they started), Duplicate, Propose as Official and Archive. Plan proposals show in Approvals.
- Enrol people in a plan from People (select rows) or the person page. The person page's Plan panel shows the current step with the message filled in (or the call script) and Done, call outcomes, Snooze, Pause/Resume, Switch and Stop. Done is refused while a {placeholder} is unfilled.
- Replies (logged or pasted into the Reply Assistant) pause the plan; Do not contact stops it; unaccepted invites are withdrawn after 14 days and finished plans end in Nurture or Lost.
- Quick-log checks the cadence guardrails and asks "Is this step N of their plan?" when it matches the current step.
- **Today** is now driven by plans: replies waiting, meetings, expired reply deadlines, plan steps due and overdue, trial check-ins, finished plans (Nurture or Lost), Nurture checks, and stale leads not on a plan. Each step shows the exact message or call script, with Done right there.
- **Dashboard**: v2 stages and benchmarks (Contacted is each person's first touch of any kind; Proposal sent and Active customer counted), and a Plans table with reply rates per plan and per step.
- About page (local test database only): a test date switch to check late steps and weekends without waiting.
- AI prompts P01–P04 updated to version 1.1 (v2 stage names; every follow-up must add something new).

## [1.5.0] - 2026-10-17

R6 AI: the Today planner as the home page, the Reply Assistant, conversation summaries and drafted messages, plus the manual QA checklist.

- Feature docs written for Today (F08), Reply Assistant (F09) and Summary/Draft (F10); the four AI prompts recorded word for word in docs/ai-prompts.md.
- Today is the home page: replies waiting, demos and recaps, follow-ups due, requests to withdraw and stale leads, plus today's connection target with a suggested persona and account filter. Done logs the matching activity; Snooze hides a lead until tomorrow. Rank with AI orders the list with a reason for each task and a 2-sentence summary of the week (F08).
- Person page AI assistant (owner or Admin): Reply Assistant (paste a reply → reply type, 2–3 suggested replies, a suggested next step, and flags for anything Product Facts doesn't cover), Summarise conversation and Draft message from a template. Mark as sent logs the message with the approach and how much it was edited (F09, F10).
- AI runs only when a button is clicked, uses only Product Facts for claims about Lumor, times out after 30 seconds with Try again, and works once ANTHROPIC_API_KEY is added. Without it, everything else works and the app says AI isn't set up.
- docs/qa-checklist.md: a step-by-step manual check of the whole app, and the launch steps only the owner can do.

## [1.4.0] - 2026-10-17

R5 Settings: Product Facts and Playbook Settings, readable by everyone and edited by Admins.

- Feature docs written for Product Facts (F12) and Playbook Settings (F13).
- Product Facts page: what Lumor does, live features, features not live yet, pricing guidance, positioning rules and the calendar link. Everyone reads; Admins edit. Shows who edited last and warns while the facts the AI needs are empty (F12).
- Playbook Settings page: follow-up delays, withdraw-after, daily targets and the stale-lead threshold. Everyone reads; Admins edit, with limits and delays kept in order. Quick-log uses the new delays straight away (F13).
- Both keep a change history.

## [1.3.0] - 2026-10-17

R4 Daily work: one-click quick-log with automatic follow-up dates, the funnel Dashboard, and everything needed to go online.

- Feature docs written for Quick-log (F15) and Dashboard (F11); D-023 (getting ready to go online).
- Quick-log rules on the server: each action logs the activity and moves the stage, sequence step and next action, with follow-up dates counted from Message 1 (F15).
- Person page: a "Log what happened" bar (Request sent, Accepted, Message 1 sent, the next follow-up, Got a reply, Demo booked, Demo held, Mark converted, Mark lost). Reply type, demo date and lost reason are asked for; a note can be added. After converting, the page offers to mark the company as a customer (F15).
- Dashboard counting on the server: funnel stages for a week or month in IST, conversions against benchmarks (amber only with 10+ in the earlier stage), and breakdowns (F11).
- Dashboard page: Week/Month switch with previous/next arrows, the funnel as a bar chart, the five conversions as tiles (amber below benchmark, or "low sample"), and a breakdown table by persona, level, account filter, template version, market or rep (F11).
- Logging in is paused for 15 minutes after 5 wrong passwords for the same email.
- Email through Resend (once a key is added): invite and password-reset links are emailed, and new @lumor.tech sign-ups confirm their email before logging in. Without a key, links are copied by hand as before.
- Ready to go online: `netlify.toml` (Node 22; each build updates the database, adds the default Admins and starting library if missing, and syncs releases) and a step-by-step guide in docs/deploy.md.

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
