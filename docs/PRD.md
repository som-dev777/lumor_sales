# Lumor Sales Hub — PRD

Oct 16, 2026 · @Somnath Chakraborty

## Overview

Lumor Sales Hub is an internal web app where Lumor's 3–6 person sales team manages LinkedIn prospecting, from finding a lead in Sales Navigator to a paying customer. It replaces spreadsheets with one shared record of every lead, every touch and every result. It also shows which personas, account lists and message templates actually convert.

**Problem**

- LinkedIn has no API for this use, so outreach is invisible unless reps log it by hand. Spreadsheets make that slow, so it doesn't happen.
- Without one shared lead list, two reps can message the same person.
- Nobody can see which persona, account list or opener template produces replies and demos, so the playbook can't improve.
- Replies sit unanswered, and follow-ups are missed because nothing tells a rep what to do today.

**Goals**

1. One shared, de-duplicated record of every lead, company and touch.
2. Logging any LinkedIn action takes one or two clicks.
3. Every morning, each rep sees a ranked list of what to do today.
4. Replies get fast, accurate, on-brand responses grounded only in approved product facts.
5. A weekly and monthly funnel shows where conversion drops, broken down by persona, account filter, template, market and rep.
6. Every change is auditable, and the app is documented well enough to keep scaling.

**Non-goals**

- No connection to LinkedIn: no scraping, no automation, no auto-sending of any message.
- Not a customer-facing product, and not a billing or invoicing system.
- No email-sequencing engine. Email and calls are logged, not sent.

**Success metrics (targets for the first 60 days after launch)**

- 90%+ of connection requests sent have a matching activity logged.
- Median time to log an action: under 5 seconds.
- Zero duplicate leads (same normalised LinkedIn URL).
- Every rep opens Today on 4 or more working days a week.
- Median time from "Reply received" to a logged response: under 1 working day.

## Users, roles and permissions

The app has two roles, Admin and User. Everyone can read everything, but each person edits only what they own. The first Admin is Somnath (s.chakraborty1409@gmail.com).

**Admin.** Sales lead or founder. Manages users, curates the Official playbook (personas, account filters, templates), approves proposals, edits Product Facts and Playbook Settings, and reassigns leads.

**User.** Sales rep. Works their own leads, builds Personal personas, filters and templates, and proposes them as Official.

| Action | Admin | User |
| --- | --- | --- |
| Invite users, assign roles, deactivate and reactivate users | Yes | No |
| View all companies, people, activities and dashboards | Yes | Yes |
| Create, edit and log activity on leads they own | Yes | Yes |
| View and add notes on leads owned by others | Yes | Yes |
| Log outreach on leads owned by others | Yes | No. Shows "This lead is claimed by {owner}" |
| Reassign the owner of a lead or company (single or bulk) | Yes | No |
| Create, edit and delete Official personas, filters and templates | Yes | No. Official items show a lock icon |
| Create, edit and delete own Personal personas, filters and templates | Yes | Yes |
| View and duplicate anyone's Personal items | Yes | Yes |
| Propose a Personal item as Official | Yes | Yes |
| Approve or reject proposals | Yes | No |
| Read Product Facts and Playbook Settings | Yes | Yes |
| Edit Product Facts and Playbook Settings | Yes | No |
| View the Audit Log | Yes | No. Users see the change history on each record's detail page |
| Edit or delete Audit Log entries | No | No |

**Deactivated users.** Users are never deleted. Setting a user inactive blocks all access on the server, not only in the UI. Any URL they open shows "Access disabled, contact your admin". They are hidden from owner dropdowns. The Admin users page lists their open leads so the Admin can reassign them.

**Enforcement.** Every rule in this table is enforced on the server by one shared permission check that every action passes through. Hiding buttons in the UI is not enough on its own.

## Features

The app has 16 features across six releases (R1–R6). F16 (About and releases) is new since the Base44 spec. P0 means required for the team to start using the app; P1 means needed within the first month.

| ID | Feature | Priority | Release |
| --- | --- | --- | --- |
| F01 | Auth and users: login, register, password reset, roles, invites, deactivation | P0 | R1 |
| F14 | Audit Log: insert-only change log for every create, edit, delete, approval and reassignment | P0 | R1 |
| F16 | About and releases: version and latest changes, read from the database | P0 | R1 |
| F04 | Personas: Official and Personal, with live stats | P0 | R2 |
| F05 | Account filters: Official and Personal, with live stats | P0 | R2 |
| F06 | Templates: library by purpose, versions, performance | P0 | R2 |
| F07 | Approvals: propose a Personal item as Official | P1 | R2 |
| F02 | People: list, filters, add/edit, duplicate check, ownership, bulk reassign | P0 | R3 |
| F03 | Companies: list, detail, linked people, mark as customer | P0 | R3 |
| F15 | Quick-log actions and sequence automation, on the person detail page | P0 | R4 |
| F11 | Dashboard: weekly and monthly funnel, benchmarks, breakdowns | P0 | R4 |
| F12 | Product Facts: the single source of facts the AI may use | P0 | R5 |
| F13 | Playbook Settings: follow-up delays and daily targets | P0 | R5 |
| F08 | Today planner: rule-based daily task list, AI-ranked | P1 | R6 |
| F09 | Reply Assistant: classify a pasted reply and suggest responses | P1 | R6 |
| F10 | Conversation summary and draft message from a template | P1 | R6 |

## Data model

There are 12 entities. Every entity also has `id`, `created_at`, `created_by` and `updated_at`. "Link" means a reference to another entity.

| Entity | Fields |
| --- | --- |
| User | name, email, role (Admin / User), active (yes/no) |
| Persona | name, type (Official / Personal), owner (link User), function (multi-select), seniority (multi-select: Entry Level, Senior, Entry Level Manager, Experienced Manager, Director, Vice President, CXO, Owner / Partner), job titles (list), geography (list, default "India"), tier (1/2/3), who it covers, tools used today, lead-with angle, notes, status (Active / Archived), proposal status (None / Proposed / Approved / Rejected) |
| AccountFilter | code (e.g. A1), name, type, owner, industries (list), company headcount, HQ location (list), key filters, exclusions, keywords, why it matters, status, proposal status |
| Company | name, website, LinkedIn URL, industry, headcount band, city, country, account filter (link), owner (link User), status (Target / Engaged / Customer / Lost), plan or tier, deal value (INR), customer start date, notes |
| Person | full name, title, LinkedIn URL (public `/in/` profile, required), LinkedIn URL normalised (unique, system-set), Sales Navigator URL (optional), company (link), persona (link), level (Leader / Practitioner), account filter (link), market/country, owner (link User), stage, sequence step, opener template (link) and version, next action, next action date, lost reason, converted (yes/no), converted date, notes |
| Activity | person (link), company (link), user (link), date-time, type, channel, content, reply type, template used (link) and version, AI suggestion used (yes/no), suggestion approach used, edit level (None / Light / Heavy) |
| Template | name, type, owner, purpose, persona (link, optional), level (Leader / Practitioner / Any), version (A / B / C), body with `{Name}`, `{Company}`, `{topic}` placeholders, status, proposal status |
| Proposal | item type (Persona / AccountFilter / Template), item (link), proposed by, proposed at, decision (Pending / Approved / Rejected), decided by, decided at, reviewer note |
| ProductFacts | single record: what Lumor does, live features, features not yet live, pricing guidance, positioning rules, calendar link, last edited by and at |
| PlaybookSettings | single record: follow-up 1 delay (default 4 days), follow-up 2 delay (7), break-up delay (10), withdraw unaccepted request after (14), daily connection request target (default 20), daily new-message target, stale-lead threshold (21 days) |
| AuditLog | date-time, user, entity type, record name, record ID, action (Created, Updated, Deleted, Approved, Rejected, Reassigned, Role changed, Deactivated, Reactivated), changed fields as before/after JSON |
| AppRelease | version, release date, summary, list of changes |

**Enumerations**

- **Stage**, in order: Prospect, Request sent, Connected, Messaged, Replied, Demo booked, Demo done, Trial/Pilot, Paid, Lost.
- **Lost reason** (required when the stage is Lost): No budget, Using competitor, Not a priority, No response, Wrong person, Other.
- **Sequence step**: Not started, Warm-up, Request sent, Message 1, Follow-up 1, Follow-up 2, Break-up, Nurture, Stopped (replied).
- **Activity type**: Profile viewed, Post engaged, Request sent, Request accepted, Request withdrawn, Message sent, Reply received, InMail sent, Demo booked, Demo held, Meeting note, Stage change, Deal update.
- **Channel**: LinkedIn, InMail, Email, Call, In person.
- **Reply type** (only on "Reply received" activities): Interested, Asking for details, Not now, Objection, Using a competitor, Not interested.
- **Template purpose**: Message 1, Follow-up 1, Follow-up 2, Break-up, Reply – interested, Reply – details, Reply – not now, Reply – competitor, Post-demo recap, InMail.

**Changes from the Base44 spec:** reply type on Activity (so "interested" is measured, not guessed), the normalised and Sales Navigator URL fields, the Proposal and AppRelease entities, the "Request withdrawn" activity type, and the stale-lead threshold and calendar link as settings.

## Screens and functional requirements

There are 14 screens behind a left sidebar: Today, People, Companies, Personas, Account Filters, Templates, Dashboard, Approvals (Admin), Audit Log (Admin), Settings and About. Every list has empty, loading and error states. Every AI action shows a loading state.

**Auth (F01).** Login, register by invite, password reset, and the "Access disabled, contact your admin" screen for deactivated users.

**Today (F08, home).** The rep's ranked task list for the day (see AI features), plus the target progress bar ("12 of 20 requests sent") and a 2-sentence summary of the week. Each task has **Done**, which logs the matching activity, and **Snooze to tomorrow**.

**People (F02).**

- A table of all leads, with a My leads / All leads toggle. My leads is the default for Users.
- Filters: owner, persona, level, account filter, stage, market, and next action date (Overdue / Today / This week).
- An add/edit dialog. If the LinkedIn URL is already on record, block the save and show "Already added by {owner}" with a link to that record.
- Setting the stage to Lost requires a lost reason.
- Admin can select rows and bulk-reassign their owner. Each change writes an audit entry.
- CSV export of the filtered view.

**Person detail (F02, F15, F09, F10).**

- Header: name, title, company, persona, stage, sequence step, owner, next action and date, and a LinkedIn link that opens in a new tab.
- Quick-log buttons: Request sent, Accepted, Message 1 sent, Follow-up sent, Got a reply, Demo booked, Demo held, Mark converted, Mark lost. Rules are under Business rules.
- A timeline of every activity, newest first.
- The Reply Assistant panel, plus **Summarise conversation** and **Draft message**.
- The record's own change history, read from the Audit Log.

**Companies (F03).** A list with status and owner. The detail page shows company fields, linked people, a combined timeline, meeting notes and deal fields. **Mark as customer** records plan, deal value and start date, and sets status to Customer.

**Personas (F04) and Account Filters (F05).**

- Two tabs: Official (locked for Users) and Personal.
- Each card shows all fields plus live stats: leads, replied, demos, paid and reply rate.
- Actions: add, edit, delete (per permissions), duplicate, Propose as official.
- An item that leads point to can be archived but not deleted.

**Templates (F06).** A library grouped by purpose. Each template shows its version, times used and reply rate, with the same Official/Personal rules. Editing a template's body creates a new version and keeps the old one.

**Approvals (F07, Admin).** A queue of proposed personas, filters and templates, each with **Approve** (the item becomes Official, owned by Admin) or **Reject** (with an optional note). The proposer sees the outcome.

**Dashboard (F11).** A weekly and monthly funnel with conversion percentages between stages and amber highlights below benchmark. It breaks down by persona, level, account filter, template version, market and rep. A period picker defaults to the current week.

**Settings.**

- **Users** (Admin): invite, change role, deactivate or reactivate, and the list of open leads to reassign.
- **Product Facts** (F12): read for everyone, edit for Admin.
- **Playbook Settings** (F13): read for everyone, edit for Admin.

**Audit Log (F14, Admin).** A searchable table filtered by user, entity type, action and date range, with CSV export. There is no edit or delete control anywhere.

**About (F16).** The current version and the latest 5 releases, read from AppRelease.

## Business rules

All dates and times use Asia/Kolkata (IST). Weeks run Monday to Sunday. Every rule below writes an Audit Log entry when it changes a record.

**Quick-log automation (F15).** Each button logs an activity with a timestamp, then sets the stage, sequence step and next action automatically. Follow-up delays come from Playbook Settings and are counted from the Message 1 date.

| Button | Activity logged | Stage | Sequence step | Next action and date |
| --- | --- | --- | --- | --- |
| Request sent | Request sent | Request sent | Request sent | Check acceptance, +14 days |
| Accepted | Request accepted | Connected | Message 1 | Send Message 1, today |
| Message 1 sent | Message sent | Messaged | Message 1 | Send Follow-up 1, Message 1 date +4 days |
| Follow-up sent | Message sent | Messaged | Follow-up 1, then Follow-up 2, then Break-up | Next step at +7 and +10 days; after Break-up: Nurture, no date |
| Got a reply | Reply received (reply type required) | Replied | Stopped (replied) | Respond, today |
| Demo booked | Demo booked (asks for the demo date) | Demo booked | Stopped (replied) | Hold demo, on the demo date |
| Demo held | Demo held | Demo done | unchanged | Send recap, today |
| Mark converted | Deal update | Paid | unchanged | None. Sets converted = yes and today's date, and offers **Mark as customer** on the company |
| Mark lost | Stage change | Lost | Stopped (replied) | None. Lost reason required |

- Trial/Pilot is set from the stage dropdown, not a quick-log button.
- Users can't log outreach on a lead someone else owns. They see "This lead is claimed by {owner}", but can still add notes.
- Changing the stage manually logs a "Stage change" activity.

**LinkedIn duplicate check (F02).**

1. The main LinkedIn field accepts only public profile links (`linkedin.com/in/…`). A Sales Navigator link (`linkedin.com/sales/…`) is rejected with "Paste the public profile link (linkedin.com/in/…)". Sales Navigator links go in their own optional field.
2. Before saving, normalise the URL: lowercase; strip `http://`, `https://`, `www.` and `m.`; drop query strings and fragments; drop the trailing slash. For example, `https://www.LinkedIn.com/in/Priya-S/?utm_source=x` becomes `linkedin.com/in/priya-s`.
3. The normalised URL is unique in the database. The check runs on both create and edit.
4. A duplicate blocks the save and shows "Already added by {owner}" with a link to the existing record.

**Funnel and benchmarks (F11).** Stages are counted from activities dated inside the selected period.

| Stage | Counted from |
| --- | --- |
| Requests sent | Request sent activities |
| Accepted | Request accepted activities |
| Replied | First Reply received per person |
| Interested | Reply received with reply type Interested |
| Demo booked | Demo booked activities |
| Demo held | Demo held activities |
| Trial | Stage changes to Trial/Pilot |
| Paid | People marked converted |

| Conversion | Benchmark |
| --- | --- |
| Requests sent → Accepted | 30% |
| Accepted → Replied | 10% |
| Interested → Demo booked | 50% |
| Demo booked → Demo held | 70% |
| Demo held → Trial | 30% |

- A conversion below its benchmark turns amber, but only when the earlier stage has 10 or more entries in the period.
- Below 10, the percentage shows greyed with a "low sample" hint, so 1 of 2 isn't read as a trend.

**Audit Log (F14).**

- Every create, edit, delete, approval, rejection, reassignment, role change and deactivation goes through one server-side `writeAudit()` function. It records changed fields with before and after values.
- The table is insert-only, enforced by SQLite triggers: no role, including Admin, can update or delete an entry.

**Library items (F04–F07).**

- Approving a proposal makes the item Official and Admin-owned. The original proposer is kept on the Proposal record.
- An item that leads or templates point to can be archived but not deleted. Archived items are hidden from pickers but stay visible on old records.
- Persona, account filter and template stats count only that item's own leads and activities.

**Product Facts and Playbook Settings (F12, F13).** Each is a single record, readable by all and editable only by Admin. Every AI feature reads Product Facts at call time, so edits apply immediately.

## AI features

There are four AI prompts (P01–P04). Each runs only when a user clicks a button, never sends anything on its own, and uses only Product Facts for claims about Lumor. Calls run server-side with the API key kept out of the browser. Each prompt is stored word for word in `docs/ai-prompts.md` with a version number.

**Today planner (F08, P01).** Rules build the list first; the AI only orders and explains it. If the AI call fails, the rule-based list shows unranked.

Rule-based sections for the logged-in rep, in this order:

1. **Replies waiting:** the last activity is "Reply received" with no response logged. Always on top.
2. **Demos today, and recaps after demos.**
3. **Follow-ups due,** from the sequence step and the Playbook Settings delays.
4. **Requests to withdraw:** sent more than 14 days ago and not accepted.
5. **New outreach target:** connection requests left to hit today's target, with a suggested persona and account filter to work on.
6. **Stale leads:** no activity for 21+ days and not Lost or Paid.

P01 receives the list and the last 7 days of activity. It returns:

- The tasks ordered by impact: replies and interested leads first, Tier 1 personas before Tier 2.
- A one-line reason for each task.
- A 2-sentence summary of the rep's week: requests, replies and demos against targets.

**Reply Assistant (F09, P02).**

1. The rep pastes the prospect's message and clicks **Suggest replies**. The text is saved as a "Reply received" activity.
2. P02 receives the reply, the full timeline, the person's persona, level, company, stage and sequence step, the matching reply templates, and Product Facts.
3. The panel shows:
   - The **reply type**, which the rep can change. It's saved on the activity and drives the "Interested" funnel count.
   - **2–3 suggested replies,** each labelled with its approach (e.g. "Book the demo", "Answer first, then ask", "Soft reschedule"), each editable with a Copy button.
   - A **suggested stage change and next action with date**, with Confirm.
   - **Flags** for anything the AI couldn't answer from Product Facts.
4. **Mark as sent** logs a "Message sent" activity with the final text, the approach used, AI suggestion used = yes, and the edit level.

**Summarise conversation (F10, P03).** The rep pastes a whole LinkedIn thread. The AI returns a short summary, the prospect's needs and objections, and a suggested stage and next action to confirm.

**Draft message (F10, P04).** The rep picks a template. The AI fills the placeholders and personalises it from the person's record and timeline. The rep copies it, and on Mark as sent it's logged with the template and version.

**Guardrails (in every prompt)**

- Replies are 2–4 lines, plain and friendly, with no hard selling.
- Use only facts from Product Facts. Never invent features, prices or claims.
- Recruitment is through partner panels. Never call the panel proprietary.
- Present Lumor as a live, proven product, but mention only features Product Facts lists as live.
- When the prospect is interested, offer two specific 20-minute demo slots and the calendar link.
- If the answer needs something not in Product Facts (custom pricing, security, legal), reply "I'll check and come back to you" and raise a flag.

**Edit level.** Compare the sent text with the AI suggestion. None = unchanged; Light = up to 20% of characters changed; Heavy = more than 20%. This shows which suggestions reps trust.

## Non-functional requirements and stack

The app is a single Next.js project built in Cursor with Claude Code. The database is SQLite: a file inside the project during development, and Turso (hosted SQLite) in production. There is no Base44 or Supabase dependency.

**Stack**

| Layer | Choice | Purpose |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | Runs everything |
| Framework | Next.js (App Router) and TypeScript | Frontend and backend in one project |
| Styling | SCSS modules with CSS variables (`sass`) | Matches Lumor's codebase. No Tailwind, no inline styles |
| UI building blocks | Radix UI (unstyled) | Accessible dialogs, dropdowns, tabs and tooltips, styled with SCSS |
| Icons | Lucide | Icon set |
| Tables | TanStack Table | People, Companies and Audit Log lists: filters, sorting, bulk select |
| Forms and validation | React Hook Form and Zod | One set of validation rules on the browser and the server |
| Charts | Recharts | Dashboard funnel |
| Dates | date-fns and date-fns-tz | IST handling and Monday–Sunday weeks |
| Backend and API | Next.js Server Actions and Route Handlers | Server Actions for creates, edits and quick-log. Route Handlers for CSV export and AI calls |
| Database | SQLite: `data/app.db` in development, Turso in production | All app data |
| Database toolkit | Drizzle ORM with the libSQL client | Tables defined in TypeScript, migrations, one code path for the local file and Turso |
| Auth | Better Auth (email and password, admin plugin) | Login, invite-only signup, password reset, roles, deactivation. Tables live in the same SQLite database |
| Email | Resend | Invite and password-reset emails |
| AI | Anthropic API (`@anthropic-ai/sdk`), server-side only | Today ranking, Reply Assistant, summaries, drafts |
| Testing | Vitest (unit) and Playwright (browser) | URL normalisation, funnel maths, permissions, audit lock |
| Code quality | ESLint and Prettier | Consistent code |
| Version control | Git and a private GitHub repository | Code history and backup |
| Hosting | Netlify | Where the team uses the app |
| Backups | Turso built-in backups | Protects the data |

Netlify can't keep a SQLite file between requests, so production uses Turso. The fallback, if the team prefers a plain SQLite file in production, is a host with a persistent disk (Railway or Render) and a nightly copy of `app.db` as the backup.

**Design.** Light theme, Inter font. Primary #3D5DFD, page background #F6F6F6, white cards with 12px radius and #E8E8E8 borders, text #111111 and #3F3F3F. Green #32D74B for converted and paid; red #FF453A for lost and overdue. Usable on a laptop; Today and People also work on mobile.

**Performance.** Actions show feedback within 400 ms. Lists of up to 5,000 people load in under 2 seconds. AI responses show a loading state and time out after 30 seconds with a retry option.

**Security.**

- SQLite has no row-level security, so every permission is enforced on the server by one shared permission check that every Server Action and Route Handler calls. Hiding a button is never the only guard.
- The audit table is locked by SQLite triggers that reject any update or delete.
- API keys live only in server-side environment variables. `.env.local` and the `data/` folder are never committed; `.env.example` lists the variables.
- Users can't sign up without an invite.

**Reliability.** Turso keeps daily backups of the production database. If an AI call fails, the feature degrades without blocking work; for example, Today still shows the rule-based list.

**Documentation and versioning (standing rule).**

- A `/docs` folder holds README (with a feature index), CHANGELOG, data-model, roles-permissions, ai-prompts, decisions, and one file per feature (F01–F16).
- The version follows MAJOR.MINOR.PATCH, starting at v1.0.0.
- Every change, in the same step: updates its feature doc and change history, adds a CHANGELOG entry, bumps the version, updates README, adds an AppRelease record, and records significant choices in decisions.md.
- A new feature gets the next F-number and its doc before any code is written.
- These rules live in `CLAUDE.md` at the project root, so every Claude Code session follows them.

## Release plan

The app ships in six releases. Each ends with something testable in the browser, and the next starts only after the previous one passes its exit check.

1. **R1 Foundation (v1.0.0):** F01, F14 and F16, plus the app shell, the docs system and `CLAUDE.md`. Exit check: invite a user, deactivate them, and confirm they're blocked, and that the audit entries can't be edited even by Admin.
2. **R2 Library (v1.1.0):** F04–F07, with seed data loaded. Exit check: a User proposes a persona, Admin approves it, and it shows as Official and locked.
3. **R3 Leads (v1.2.0):** F02 and F03. Exit check: adding the same person through five URL variants and a Sales Navigator link creates exactly one record.
4. **R4 Daily work (v1.3.0):** F15 and F11. Exit check: one lead walked from Request sent to Paid moves through every stage, and the dashboard counts it.
5. **R5 Settings (v1.4.0):** F12 and F13. Product Facts filled in before R6.
6. **R6 AI (v1.5.0):** F08, F09 and F10. Exit check: a pasted reply returns a reply type, 2–3 suggestions with no invented facts, and a stage suggestion; Today ranks a real rep's list.

The team starts using the app after R4. Deploy to Netlify with Turso at R4.

## Open questions

- [ ] Are follow-up delays counted from Message 1 (day 4, 7, 10) or from the previous step? This PRD assumes Message 1.
- [ ] Should the funnel count events in the period (this PRD) or follow a cohort of requests sent in the period?
- [ ] Is Trial/Pilot used in practice, or should Demo done go straight to Paid?
- [ ] Deal value currency: INR only, or INR and USD (pricing is published in USD)?
- [ ] Should the SMB QR plan get its own persona and account filter in the seed data?
- [ ] Who besides Somnath is Admin at launch?

## Appendix: seed data

Loaded in R2. Geography is "India" on all personas, and account filters are HQ India unless noted.

**Official personas**

| Persona | Tier | Example titles | Uses today | Lead with |
| --- | --- | --- | --- | --- |
| Research & Insights | 1 | Head of Research, Research Manager, User Researcher, Consumer Insights Manager, Market Research Manager | Qualtrics, SurveyMonkey, Typeform, Google Forms, Dovetail | One platform from survey to panel to report; Logic Map; AI that proposes changes for review |
| Product & Design | 2 | Product Manager, Head of Product, Product Designer, UX Designer, Head of Design | Maze, Ballpark, Typeform, Google Forms | Real research with recruited users, without hiring a researcher |
| CX, Brand & Marketing | 2 | CX Manager, Brand Manager, Product Marketing Manager, CMO, Planning Director | SurveyMonkey, Typeform, in-house NPS tools, agencies | NPS and concept or ad tests in-house, with AI on open-ended answers |
| Founders & Agency Directors | 1 | Founder, Co-Founder, Managing Director, CEO, Research Director | Qualtrics, Forsta/Decipher, Alchemer | Agencies: intercepts through their own panel. Startups: one tool for all research |
| Independent Researchers & Consultants | 1 | Research Consultant, Independent Researcher, UX Researcher | Typeform, SurveyMonkey, Google Forms | Panel access plus client-ready reports in one subscription |

The full seniority, function and title lists are in the original spec, `base44-prompt-lumor-sales-hub.md`, section 6.

**Official account filters**

| Code | Name | Industry | Headcount | Key filters |
| --- | --- | --- | --- | --- |
| A1 | Research Agencies | Market Research | 11–500 | Keywords: fieldwork OR quantitative OR "consumer research" |
| A2 | Ad & Creative Agencies | Advertising Services | 11–1,000 | None |
| A3 | Research-Mature Companies | Any (excludes Market Research, Staffing, Higher Ed, Hospitals, Biotech, Pharma) | 201–10,000 | Research dept 5+; consider no HQ filter |
| A4 | Emerging Research Teams | Any (same exclusions as A3) | 51–1,000 | Research dept 1–4 |
| A5 | Product Companies | Software; Tech and Internet; Financial Services | 11–500 | Product dept 3+ |
| A6 | Consumer & D2C Brands | Consumer Goods; Retail; Food and Beverage; Personal Care; Apparel | 51–2,000 | HQ Bengaluru, Mumbai, Delhi NCR |

**Official templates (version A)**

| Template | Body |
| --- | --- |
| Message 1 – Research & Insights, Leader | Hi {Name}, Lumor brings survey building, partner-panel recruitment and AI analysis into one platform, so a study goes from brief to report without switching tools. How is the research stack set up at {Company} today? |
| Message 1 – Research & Insights, Practitioner | Hi {Name}, enjoyed your post on {topic}. What do you use when a survey has heavy branching? We built a visual Logic Map in Lumor for exactly that. |
| Message 1 – Product & Design | Hi {Name}, does {Company} have a dedicated researcher, or do PMs and designers run research themselves? Lumor lets product teams test ideas with real recruited users in days. |
| Message 1 – CX, Brand & Marketing | Hi {Name}, how are you running NPS at {Company} today? Lumor runs the survey, recruits follow-up respondents and summarises open-ended answers with AI. |
| Message 1 – Founders & Agency Directors | Hi {Name}, Lumor lets {Company} route respondents from your own panel through our logic, quota and AI analysis layer, without switching tools. Open to seeing it on one live study? |
| Message 1 – Independent Researchers | Hi {Name}, how do you handle recruitment for client studies? Lumor gives independent researchers panel access and client-ready reports in one workspace. |
| Follow-up 1 | {Name}, here's a 60-second look at {workflow}: {video}. Worth 20 minutes to see it on a study like yours? |
| Follow-up 2 | Thought this might be useful: {link}. Happy to show how teams like {Company} use it. |
| Break-up | I'll leave it here, {Name}. If a study with tricky logic or recruitment comes up, I'm one message away. |
| Reply – interested | Great. Does {slot 1} or {slot 2} work for 20 minutes? Or pick a slot here: {calendar link}. I'll show it on a study like yours. |
| Reply – not now | Understood. When does research planning usually happen at {Company}? |
| Reply – competitor | Makes sense. Most teams we talk to use {tool} for surveys and something else for recruitment and analysis. Is that the case for you too? |
