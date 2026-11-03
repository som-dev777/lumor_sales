# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]

Next: the owner's QA of v2.7.7 and the Gmail setup.

## [2.7.7] - 2026-11-03

One meeting, one Meet link (D-050).

- Fixed: the rep and the person who booked could get different meeting links. Now everyone (the person who booked, the rep, teammates and guests) gets the same Google Meet link, everywhere.

## [2.7.6] - 2026-11-03

The person who books always gets an email (D-049).

- Fixed: with email not set up, nobody was emailed after 2.7.4. Now Google sends its invite whenever the app can't send email; once Gmail is set up, Lumor's own branded emails go instead.

## [2.7.5] - 2026-11-03

No gaps between meetings; clearer booking times; delete events (D-048).

- The gap between meetings is gone everywhere.
- The booking page says how many times are available that day and shows taken times greyed out; unavailable dates are black.
- Events can be deleted for good, after a confirmation. Event cards say Online or Offline, with **Go online** / **Go offline** buttons.

## [2.7.4] - 2026-11-03

Booking emails, the booking page in steps, taken times and missing slots (D-047).

- People who book now get Lumor's own email (the event's title and date in the subject, your wording inside, the calendar file attached) instead of Google's "Invitation from an unknown sender". Google still keeps the event and the Meet link.
- **Send me a test email** on Calendar → Availability shows how emails go out and, if they fail, exactly why.
- The booking page goes in steps: first what the meeting is about with **Choose a time**, then the day and time with the time zone on top, then the details.
- A time someone has booked, or a meeting you scheduled, is never offered again, even when two people book at the same moment.
- Availability's **Why some times are missing** lists every missing time and its reason (minimum notice, a meeting, the gap after it, Google Calendar busy). New events start with no gap. You can switch off using Google Calendar busy times for booking.
- Your Lumor icon is saved for the Gmail account's profile photo (the picture people see next to the email).

## [2.7.3] - 2026-11-03

Emails can go out through a Gmail account, so no domain is needed (D-046).

- New: set GMAIL_USER and GMAIL_APP_PASSWORD (a Gmail App Password) and every email (booking confirmations, reminders, rep emails, invitations, reports) is sent from that Gmail account. Replies still go to the rep. Resend still works if you set it up later instead.

## [2.7.2] - 2026-11-03

Plans, calendar and Today fixes from the owner's second list of 3 November (D-045).

- Plans: Delete replaces Archive; the seeded plans lose "(draft)" and are ready to use; tabs All plans, Official, Made by me. The Enrol button lines up with the plan dropdown.
- Events get a random link code that doesn't change when you rename them, so shared links keep working.
- Availability: **Why some times are missing** shows, for the next 7 days, your hours, what took time out (Google Calendar busy times, meetings, gaps) and how many times each event offers, and warns when Google couldn't be read. Days that can't be booked show in subtle red on the booking page.
- Meeting pop-up: Add without an icon; **Custom: any email address…** adds a client or colleague as a guest (invited through Google, or by our email); it closes at once. Fixed: after a success message, the first Escape only closed the message; now Escape closes the pop-up straight away.
- Today: **Your meetings** lists today's and the next 7 days' meetings with Join and Details. The Calendar number in the sidebar now counts today's meetings; notifications stay on the bell.
- Short meetings show their title on one line in the week and day views.

## [2.7.1] - 2026-11-03

Today shows every follow-up until a person is converted or lost (D-044).

- Fixed: Today said "Nothing due" while People showed overdue next actions. Today only read "Hold meeting" and "Send recap"; now any next action that's due shows under **Follow-ups due**, and overdue ones stay in **Backlog** until dealt with.
- New section **Needs a follow-up date**: people from Contacted to Trial with no next date, so nobody is forgotten.
- **Done · set next follow-up** / **Set follow-up date** on those tasks: what comes next and when.
- Someone whose plan is paused (they replied) now shows their next action; an active plan still follows its own dates.

## [2.7.0] - 2026-11-03

The owner's list of 3 November: events and the booking form, reminders, bookings that update the person, Calendly, Schedule a meeting, Today backlogs, custom plan tasks, no approvals, and reports you can send (D-043).

- Calendar round 3: "Meeting types" are now Events; each event's booking form lists email first, then name, company, phone, LinkedIn and "online or in person", each with Show and Required; reminders 24 hours and 1 hour before; the owner's email wording; the Lumor logo on booking pages; the phone box shows "IN +91"; the confirmation page offers only Reschedule and Cancel; Schedule a meeting with To and CC; the calendar shows one rep at a time, starting with you.
- Fixed: a required checkbox question refused ticked answers ("Pick from the choices given"), which stopped the booking, so nothing reached the calendar, notifications or email.
- Bookings update the person: Meeting booked with the answers, Meeting scheduled, plan paused; a cancel returns them to Replied and resumes the plan; a reschedule is one Meeting moved. Someone new is added (no LinkedIn needed) with a Check details flag.
- Calendly (F27): a verified webhook applies the same rules to Calendly bookings.
- Today: a Backlog section at the top for anything due on an earlier day (a reply not answered, a meeting not marked held, a nudge, a plan step, a withdraw), with how many days late. Snooze asks for a date and the task comes back that day.
- People and Companies show a red Backlog badge; People has a "Backlog only" filter. A person added by a booking shows "Check details" until someone clicks Done checking.
- Team tab: the counters follow each person's My day exactly (Backlog and Meetings today added); click any number to see the list behind it.
- Plans: "Channel" is now "Task", with a Custom task (type your own name, offered again next time) and a custom template purpose; Remove step is labelled; saving changed steps can move the people already on the plan to the new version.
- No more approvals: anyone creates Official or Personal plans, personas, account filters and templates; "Propose as Official" is now "Make Official"; the Approvals page is gone.
- Reports: choose who gets it (tick teammates, type any email addresses) and it's emailed with the PDF attached; Email this report on any saved report; Report history has Made by me, Shared with me and (Admins) All, and teammates get a notification when a report is sent to them.
- Reports now start with a Pipeline section per rep: people and companies added, new outreach, replied, converted, no response yet, and where their people stand by stage, with charts. Download PDF gives a real PDF with charts and every table.

## [2.6.0] - 2026-11-02

Calendar round 2: question types, a friendlier booking page, notifications, teammates on meetings, a month/week/day calendar and Google Meet links (D-042).

- Meeting types: questions can be Short answer, Paragraph, Dropdown or Checkboxes (with your own choices), up to 10; any length (Custom); optional Google Meet link per booking.
- Availability: as many time ranges a day as you need (e.g. 11:00–11:30, 12:00–12:30); **What people see** previews the free times and warns when a meeting doesn't fit; choose where your booking emails go.
- Booking page: month calendar and times side by side (one column on phones), India Standard Time first with every time zone in a dropdown, only your own questions, red stars on required fields, a real email check, phone with a country flag dropdown, footer "Lumor". Wrong or changed links show a plain "This link doesn't work" page with no way into the app.
- Notifications (F25): a bell with the number of new ones (also on Calendar) for new bookings, cancellations, reschedules and teammate changes, each also emailed.
- Calendar: month, week, day and list views; everyone sees everyone's meetings (filter by rep); click a meeting for details, **Add a teammate**, **Reschedule** and **Cancel**. Teammates are notified and their meetings block their own booking slots.
- Google Calendar and Meet (F26): connect your Google account and every booking gets its own Meet link, lands in your Google Calendar (booker and teammates invited) and avoids your Google busy times. Needs a one-time setup (docs/deploy.md).

## [2.5.0] - 2026-11-02

Calendar with booking links, an AI chat on every person, and Fill with AI on the company and person forms (D-041).

- Calendar (F22): under Today in the sidebar. Set weekly hours (IST) and days off, create meeting types, and share a booking link for each; anyone books without an account, in their own time zone. Bookings email both sides a calendar invite, link to the person (logging Meeting booked) and show on Today. Reschedule and cancel from the visitor's link or from Calendar.
- AI chat (F23): the person page's AI assistant opens on **Chat**: talk it through with the AI, then **Use this message** and Mark as sent. Chats are saved and private.
- Fill with AI (F24): on the Add/Edit company and person forms, the AI searches the web and fills the empty fields (India office, Bangalore first; a foreign headquarters goes in the notes).
- The AI offers each rep's own booking link to prospects.
- Your logo is the brand icon; the sidebar lists Companies before People.

## [2.4.0] - 2026-10-30

QA round 1: people need a company, company page shortcuts, delete and merge, an Industries list, the Lumor icon, new outreach counts added people, and fixes for reset login, the lead tabs and AI.

- People: a company is required, picked from existing companies (or **+ Add a new company**). Admins can delete a person.
- Company page: **Add person** with the company filled in; notes are editable; Admins can **merge** duplicate companies and **delete** empty ones.
- New **Settings → Industries** (F21): add, rename and delete industries; the company form picks from the list.
- The Lumor icon now sits in the top-left with "Sales Hub", and is the browser tab icon (it was Next.js's default).
- Today: each person added today counts toward the daily new-outreach target.
- Fixes: logging in after a password reset (earlier wrong passwords and email confirmation no longer get in the way); My leads / All leads show a loading dot; AI features switch to a model the OpenAI project allows and explain model problems clearly.

## [2.3.0] - 2026-10-30

R9 Reports: saved reports on anyone's work for any period, with print-to-PDF, CSV, an optional AI summary, and scheduled reports emailed with a link.

- Feature doc written for Reports (F19) with the owner's choices; decision D-039.
- New **Reports** page (sidebar): make a report on yourself (Admins: the whole team or anyone) for today, this week, month, quarter, half-year, year or a custom range. It shows activity, replies and outcomes with deal value, plan steps done on time or late, plan reply rates and the funnel. Every report is saved in Report history and never changes afterwards.
- **Download PDF** (a print-ready page saved with the browser's Save as PDF) and **Download CSV**. **Write AI summary** adds 2–3 sentences from the report's numbers (new prompt P06).
- **Scheduled reports** (Admins): daily, weekly, monthly, quarterly, half-yearly or yearly, at a time in IST, for the whole team, one person or each rep, emailed to Admins, a list or each rep with a link to the saved report. Three defaults: Daily team report, Weekly team report and Daily personal summary. They run online every 15 minutes through a Netlify scheduled function (needs `CRON_SECRET`), and are emailed once the Resend key is set.
- Plan steps now keep the date they were due, so reports can tell on time from late.

- Deploy guide: example site addresses are placeholders (they tripped Netlify's secrets scan), and it explains `SECRETS_SCAN_OMIT_KEYS`.

## [2.2.0] - 2026-10-22

R8 Conversations: every message is recorded with who sent it, where and when, and the AI suggests the next message from the whole conversation, with reply-by dates and nudges on Today.

- Feature doc written for the conversation thread (F18) with the owner's choices; decision D-038.
- Person pages get a chat-style **Conversation** instead of the timeline: every message shows who sent it (you or them), where (LinkedIn, InMail, Email, WhatsApp, Call or In person) and when. Add messages one at a time, with an earlier time if needed, or **paste a whole conversation** and let the AI split it for you to check. Old activities appear in it automatically.
- A reply pauses the plan from the time it arrived; messages dated earlier re-plan quietly from their real date.
- **Suggest next message** replaces the Reply Assistant: it reads the whole conversation and knows whether to reply, wait, nudge, close the loop or start. Accepting a suggestion sets an **Expect a reply by** date you confirm.
- **Today**: when that date passes, a nudge task with **Draft nudge** (at most 2 nudges, then close the loop). Admins get a **Team** tab.
- Summarise and Draft read the conversation; no more pasting. AI prompts: P02 v2.0, P03 and P04 v1.3, new P05 (split conversation).

## [2.1.0] - 2026-10-22

AI Resources: the AI now runs on OpenAI and reads a knowledge base the team manages, and reps get one place for decks and product videos.

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
