# Data model

SQLite, defined in TypeScript with Drizzle ORM (`src/lib/db/schema/`). Locally it is the
file `data/app.db`; in production it is Turso. Migrations live in `drizzle/`.

This document must match the code. Update it in the same step as any schema change.

## Conventions

- Table and column names are snake_case.
- `id` is a text UUID, except the two single-row settings tables (`id` = 1).
- Every Lumor table has `id`, `created_at`, `created_by` (→ user.id) and `updated_at`.
  These are not repeated in the tables below. Better Auth's own `session`, `account` and
  `verification` tables follow Better Auth's layout (no `created_by`).
- `created_at` and `updated_at` are filled in automatically, by the app and by the database.
- Date-times are stored as integers: UTC milliseconds. They are shown in IST (Asia/Kolkata).
- Plain dates (no time) are `YYYY-MM-DD` text, meaning an IST calendar date.
- Lists and multi-selects are JSON text arrays. Their allowed values are checked with Zod.
  Persona function and seniority accept team-added options besides the built-in lists (D-018).
- Yes/no fields are integers 0 or 1.
- Fixed lists of allowed values (enums) are enforced with CHECK constraints.
- Foreign keys use ON DELETE RESTRICT. The database refuses to delete a row that others
  still point to, which is how "archive, don't delete" is enforced.
- Foreign keys are enforced on every connection, including inside transactions. libSQL turns
  this on by default, and a test fails if that ever changes.
- Schema code: `src/lib/db/schema/` (one file per table group). Allowed values:
  `src/lib/db/enums.ts`. Migrations: `drizzle/` (generated with `npm run db:generate`;
  the triggers are in the hand-written `0001_lock_audit_log_and_users.sql`).
  Apply them with `npm run db:migrate`.

## Enumerations

| Name               | Values                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role               | Admin, User                                                                                                                                                                                                                     |
| Library type       | Official, Personal                                                                                                                                                                                                              |
| Library status     | Active, Archived                                                                                                                                                                                                                |
| Proposal status    | None, Proposed, Approved, Rejected                                                                                                                                                                                              |
| Seniority          | Entry Level, Senior, Entry Level Manager, Experienced Manager, Director, Vice President, CXO, Owner / Partner                                                                                                                   |
| Level              | Leader, Practitioner (templates also allow Any)                                                                                                                                                                                 |
| Company status     | Target, Engaged, Customer, Lost                                                                                                                                                                                                 |
| Stage              | v2 (D-029): Prospect, Contacted, Connected, Replied, Meeting scheduled, Meeting done, Proposal sent, Trial, Paid, Active customer, Lost                                                                                         |
| Lost reason        | No budget, Using competitor, Not a priority, No response, Wrong person, Other                                                                                                                                                   |
| Activity type      | Profile viewed, Post engaged, Request sent, Request accepted, Request withdrawn, Message sent, Reply received, InMail sent, Meeting booked, Meeting held, Meeting note, Stage change, Deal update, Call, Task done, Plan change |
| Thread channel     | LinkedIn, InMail, Email, WhatsApp, Call, In person (where a conversation message happened, F18)                                                                                                                                 |
| Direction          | out, in                                                                                                                                                                                                                         |
| Channel            | LinkedIn, InMail, Email, Call, WhatsApp, In person (In person is for meetings only)                                                                                                                                             |
| Call outcome       | Connected, No answer, Call back later, Wrong number, Not interested                                                                                                                                                             |
| Plan type          | Outreach, Meeting follow-up, Trial, Onboarding                                                                                                                                                                                  |
| Step channel       | LinkedIn connection request, LinkedIn message, InMail, Email, Call, WhatsApp, Manual task                                                                                                                                       |
| Channel condition  | always, phone (a phone is known), email (an email is known)                                                                                                                                                                     |
| Enrolment status   | Active, Paused, Completed, Stopped                                                                                                                                                                                              |
| Reply type         | Interested, Asking for details, Not now, Objection, Using a competitor, Not interested                                                                                                                                          |
| Template purpose   | Message 1, Follow-up 1, Follow-up 2, Break-up, Reply – interested, Reply – details, Reply – not now, Reply – competitor, Post-demo recap, InMail                                                                                |
| Template version   | A, B, C                                                                                                                                                                                                                         |
| Edit level         | None, Light, Heavy                                                                                                                                                                                                              |
| Proposal item type | Persona, AccountFilter, Template, Plan                                                                                                                                                                                          |
| Proposal decision  | Pending, Approved, Rejected                                                                                                                                                                                                     |
| AI prompt          | P01 (Today planner), P02 (Reply Assistant), P03 (Summarise), P04 (Draft message)                                                                                                                                                |
| Resource category  | Sales deck, Product video, One-pager, Case study, Image, Other                                                                                                                                                                  |
| Resource kind      | file, link                                                                                                                                                                                                                      |
| Audit action       | Created, Updated, Deleted, Approved, Rejected, Reassigned, Role changed, Deactivated, Reactivated                                                                                                                               |

## The 12 PRD entities

### user

Better Auth's user table, with Lumor's fields added.

| Column               | Rules                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| name                 | required                                                               |
| email                | required, unique                                                       |
| email_verified       | 0/1 (required by Better Auth)                                          |
| image                | optional (required by Better Auth)                                     |
| role                 | Role, default User                                                     |
| active               | 0/1, default 1                                                         |
| must_change_password | 0/1, default 0. Forces a password change before any other page (D-006) |
| created_by           | may be empty: the first Admin is created by a script                   |

### persona

| Column           | Rules                          |
| ---------------- | ------------------------------ |
| name             | required                       |
| type             | Library type                   |
| owner_id         | → user, required               |
| functions        | JSON list                      |
| seniority        | JSON list of Seniority values  |
| job_titles       | JSON list                      |
| geography        | JSON list, default `["India"]` |
| tier             | 1, 2 or 3                      |
| who_it_covers    | text                           |
| tools_used_today | text                           |
| lead_with_angle  | text                           |
| notes            | text                           |
| status           | Library status, default Active |
| proposal_status  | Proposal status, default None  |

### account_filter

| Column            | Rules                                             |
| ----------------- | ------------------------------------------------- |
| code              | required (e.g. A1). Unique among Official filters |
| name              | required                                          |
| type              | Library type                                      |
| owner_id          | → user, required                                  |
| industries        | JSON list                                         |
| company_headcount | text (e.g. "11–500")                              |
| hq_locations      | JSON list                                         |
| key_filters       | text                                              |
| exclusions        | text                                              |
| keywords          | text                                              |
| why_it_matters    | text                                              |
| status            | Library status, default Active                    |
| proposal_status   | Proposal status, default None                     |

### company

| Column              | Rules                          |
| ------------------- | ------------------------------ |
| name                | required                       |
| website             | text                           |
| linkedin_url        | text                           |
| industry            | text                           |
| headcount_band      | text                           |
| city                | text                           |
| country             | text                           |
| account_filter_id   | → account_filter               |
| owner_id            | → user, required               |
| status              | Company status, default Target |
| plan_tier           | text                           |
| deal_value_inr      | integer, whole rupees          |
| customer_start_date | plain date                     |
| notes               | text                           |

Unique: the company name, ignoring case and surrounding spaces (`lower(trim(name))`, D-021).

### person

| Column                  | Rules                                                        |
| ----------------------- | ------------------------------------------------------------ |
| full_name               | required                                                     |
| title                   | text                                                         |
| linkedin_url            | required, must contain `linkedin.com/in/`                    |
| linkedin_url_normalised | required, **unique**, set by the server (see F02)            |
| sales_nav_url           | optional                                                     |
| company_id              | → company                                                    |
| persona_id              | → persona                                                    |
| level                   | Leader or Practitioner                                       |
| account_filter_id       | → account_filter                                             |
| market                  | text (market/country)                                        |
| owner_id                | → user, required                                             |
| stage                   | Stage, default Prospect                                      |
| opener_template_id      | → template                                                   |
| opener_template_version | A, B or C                                                    |
| next_action             | text                                                         |
| next_action_date        | plain date                                                   |
| snoozed_until           | plain date; hidden from Today until then (F08)               |
| lost_reason             | Lost reason. **Required when stage is Lost** (CHECK)         |
| converted               | 0/1, default 0                                               |
| converted_date          | plain date                                                   |
| notes                   | text                                                         |
| phone                   | optional (v2)                                                |
| email                   | optional (v2)                                                |
| seniority               | Seniority, optional; Vice President/CXO get 45 days (D-033)  |
| do_not_contact          | 0/1, default 0; stops plans and blocks outreach              |
| dnc_reason              | required when do_not_contact is on (form rule)               |
| dnc_date                | plain date it was set                                        |
| nurture_until           | plain date; no touches until then (F17)                      |
| awaiting_reply_until    | plain date; the reply-by date the rep confirmed (F18)        |
| nudge_count             | nudges sent since the last reply, default 0 (F18: at most 2) |

`sequence_step` was removed in v2 (D-032); a plan's current step replaces it.

Indexes: owner_id, stage, next_action_date, company_id, persona_id.

### activity

| Column              | Rules                                                            |
| ------------------- | ---------------------------------------------------------------- |
| person_id           | → person, required                                               |
| company_id          | → company                                                        |
| user_id             | → user, required                                                 |
| occurred_at         | date-time, required                                              |
| type                | Activity type                                                    |
| channel             | Channel, default LinkedIn                                        |
| content             | text                                                             |
| reply_type          | Reply type. **Only allowed when type is Reply received** (CHECK) |
| template_id         | → template                                                       |
| template_version    | A, B or C                                                        |
| ai_suggestion_used  | 0/1, default 0                                                   |
| suggestion_approach | text                                                             |
| edit_level          | Edit level                                                       |
| call_outcome        | Call outcome (v2)                                                |
| plan_enrolment_id   | the plan enrolment this touch or reply belongs to (no FK)        |
| plan_step_order     | the plan step number                                             |
| to_stage            | for Stage change: the stage moved to (filled for v1 rows, D-029) |
| request_note        | 0/1: a connection request sent with a note (counts as a touch)   |
| direction           | `out` (from the rep), `in` (from the prospect) or empty (F18)    |

Indexes: (person_id, occurred_at), (user_id, occurred_at), (type, occurred_at), plan_enrolment_id.

### template

| Column          | Rules                                                   |
| --------------- | ------------------------------------------------------- |
| name            | required                                                |
| type            | Library type                                            |
| owner_id        | → user, required                                        |
| purpose         | Template purpose                                        |
| persona_id      | → persona, optional                                     |
| level           | Leader, Practitioner or Any                             |
| version         | A, B or C: the A/B test variant                         |
| body            | text with `{Name}`, `{Company}`, `{topic}` placeholders |
| revision        | integer, starts at 1, +1 each time the body is edited   |
| status          | Library status, default Active                          |
| proposal_status | Proposal status, default None                           |

### proposal

| Column        | Rules                                 |
| ------------- | ------------------------------------- |
| item_type     | Proposal item type                    |
| item_id       | id of the persona, filter or template |
| proposed_by   | → user, required                      |
| proposed_at   | date-time                             |
| decision      | Proposal decision, default Pending    |
| decided_by    | → user                                |
| decided_at    | date-time                             |
| reviewer_note | text                                  |

### product_facts (single row, id = 1)

what_lumor_does, live_features, features_not_live, pricing_guidance, positioning_rules,
calendar_link, last_edited_by (→ user), last_edited_at. Since v2.1.0 (D-037) only
`calendar_link` is used (edited on AI Resources); the other text columns are kept but no longer
read or shown. The AI's facts come from `knowledge_file`.

### playbook_settings (single row, id = 1)

| Column                          | Default                          |
| ------------------------------- | -------------------------------- |
| withdraw_after_days             | 14                               |
| daily_connection_target         | 20                               |
| daily_message_target            | 10 (PRD gives no default; D-007) |
| stale_lead_days                 | 21                               |
| msg_after_accept_min_days / max | 1 / 3 (guardrail 1)              |
| min_gap_days                    | 3 (guardrail 2)                  |
| max_follow_ups                  | 4 (guardrail 3)                  |
| weekly_touch_limit              | 2 (guardrail 4)                  |
| outreach_max_days / _senior     | 30 / 45 (guardrail 7)            |
| nurture_days                    | 60                               |
| reply_deadline_min_days / max   | 1 / 10 (F18, from R8)            |

The v1 follow-up delays (4/7/10) were removed in v2: timing is set per plan step (D-032).

### plan (F17)

name, plan_type (Plan type), persona_id (→ persona, optional), type (Official/Personal),
owner_id (→ user), status (Active/Archived), proposal_status, current_version (default 1),
skip_weekends (0/1, default 1).

### plan_step

plan_id (→ plan), version, step_order, channels (JSON ordered list of `{channel, when}`; the
first that applies is used, D-033), template_purpose (Template purpose, optional), template_id
(→ template, optional), script (call script, task text or connection-request note), wait_days
(≥ 0). Unique (plan_id, version, step_order).

### plan_enrolment

person_id (→ person), plan_id (→ plan), version, status (Enrolment status), current_step
(1-based; more than the step count = all done), next_due_date, waiting_for_acceptance (0/1),
request_sent_date, accepted_date, ends_by, call_attempts, started_at, paused_at, ended_at,
end_reason. **Partial unique index `plan_enrolment_one_live`: one Active or Paused row per
person** (`WHERE status IN ('Active','Paused')`).

### knowledge_file (F20)

slug (unique, e.g. `01-company-and-positioning`), title, content (Markdown), load_for (JSON list
of AI prompts that read it), place_last (0/1: read after the others so its rules win), active
(0/1), sort_order, version (starts at 1, +1 on every text change), last_edited_by (→ user),
last_edited_at. `npm run seed:knowledge` adds the starting files from `docs/ai-knowledge/`
and never changes a file that exists.

### knowledge_revision

file_id (→ knowledge_file), version, content: the text a file had before each change. Unique
(file_id, version).

### sales_resource (F20)

title, description (optional), category (Resource category), kind (Resource kind), url (links,
https only), file_name, mime_type, size_bytes (files). Check: a link has a url, a file has a
file_name. Index on category.

### sales_resource_file

resource_id (primary key, → sales_resource), data (blob, 5 MB at most: PDF, JPG, PNG, MD or
MP4). Kept apart so the list never loads file bytes. Removing a resource deletes both rows.

### audit_log (insert-only)

| Column      | Rules                                           |
| ----------- | ----------------------------------------------- |
| occurred_at | date-time, required                             |
| user_id     | → user; empty for system actions                |
| entity_type | e.g. User, Persona, Person                      |
| record_name | readable name at the time of the change         |
| record_id   | id of the changed row                           |
| action      | Audit action                                    |
| changes     | JSON `{ "field": { "before": …, "after": … } }` |

Indexes: occurred_at, (entity_type, record_id), user_id.

### app_release

| Column       | Rules            |
| ------------ | ---------------- |
| version      | required, unique |
| release_date | plain date       |
| summary      | text             |
| changes      | JSON list        |

## Support tables (not business entities)

| Table             | Why it exists                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session           | Better Auth: one row per signed-in browser (token, expires_at, user_id, ip_address, user_agent).                                                                           |
| account           | Better Auth: login method and password hash.                                                                                                                               |
| verification      | Better Auth layout: password-reset tokens (`reset-password:…`) and sign-up email confirmations (`verify-email:` + a hash of the secret; value = user id; 24 hours, D-023). |
| login_attempt     | email, succeeded, occurred_at; index (email, occurred_at). Pauses logins after 5 wrong passwords in 15 minutes (D-023). Rows older than a day are pruned; not audited.     |
| invite            | email, role, token_hash (unique; only a hash of the link's secret is stored), expires_at (7 days), accepted_at, revoked_at.                                                |
| template_revision | template_id, revision, body; unique (template_id, revision). Keeps old template bodies (F06).                                                                              |

The PRD's `role` and `active` columns are the source of truth. The Better Auth admin plugin is
not used (D-010).

The two settings tables get their single row (with PRD defaults) from the migration itself.

## Triggers (database-level locks)

Deactivation no longer deletes sessions: the app needs the session to show "Access disabled"
(D-010). Every page and action checks `active` instead.

| Trigger             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| audit_log_no_update | Rejects any UPDATE of audit_log: "audit_log is insert-only". |
| audit_log_no_delete | Rejects any DELETE of audit_log.                             |
| user_no_delete      | Rejects any DELETE of a user: deactivate instead.            |

Limit: someone with direct admin access to the database file or the Turso console could
drop a trigger. The app never runs schema-changing commands at runtime.

## Migrations and backups

`npm run db:migrate` applies the files in `drizzle/` in order. Before applying any pending
migration to a local database file, it copies the file to `data/backups/`. Afterwards it runs
`PRAGMA foreign_key_check` and prints the number of people per stage before and after.
0005 and 0006 move v1 data to v2 (D-029): stages, activity types, `to_stage`, new columns and
tables, and dropping `sequence_step` and the old follow-up delays. 0007 adds the four AI
Resources tables (F20). 0008 (R8) adds `activity.direction` (filled in for old rows: messages
and calls `out`, replies `in`) and `person.nudge_count`.
