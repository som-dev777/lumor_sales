# Roles and permissions

Two roles: **Admin** and **User**. Everyone can read everything; each person edits only what
they own. The default Admins are somnath@, arijeet@ and prince@lumor.tech (D-013). Anyone with
an @lumor.tech email can sign up as a User (D-012).

## How it is enforced

SQLite has no row-level security, and the browser never talks to the database. Every
Server Action and Route Handler runs this sequence on the server:

0. `src/proxy.ts` sends anyone without a login cookie to `/login` (a fast first check only).
1. `requireUser()` (`src/lib/session.ts`): signed in, account active, and no forced
   password change pending. Otherwise the user is sent to `/login`, `/disabled` or
   `/change-password`.
2. `assertCan(user, action, resource?)` (`src/lib/permissions.ts`): the **one shared
   permission check**. It refuses with "Not allowed" if the table below says no.
3. The change and `writeAudit()` run in the same database transaction.

Hiding a button in the UI is only a convenience. Database triggers add hard locks for the
audit log, user deletion and deactivation (see [data-model.md](data-model.md#triggers-database-level-locks)).

## Permission table (from the PRD)

Each PRD row maps to one or more action keys in `src/lib/permissions.ts`. Each row has a
test in `src/lib/permissions.test.ts`.

| PRD row                                                                                               | Action key(s)                                                                                                               | Admin | User                                           |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------- |
| Invite users, assign roles, deactivate and reactivate users                                           | `user.manage`                                                                                                               | Yes   | No                                             |
| View all companies, people, activities and dashboards                                                 | `record.view`                                                                                                               | Yes   | Yes                                            |
| Create, edit and log activity on leads they own                                                       | `lead.create`, `lead.edit` (with the lead)                                                                                  | Yes   | Yes                                            |
| View and add notes on leads owned by others                                                           | `record.view`, `lead.addNote`                                                                                               | Yes   | Yes                                            |
| Log outreach on leads owned by others                                                                 | `lead.edit` (with the lead): owner or Admin                                                                                 | Yes   | No. Shows "This lead is claimed by {owner}"    |
| Use the AI panel, Today's Done and Snooze on a lead                                                   | `lead.edit` (with the lead): owner or Admin                                                                                 | Yes   | Own leads only                                 |
| Add messages to the conversation (from me / from them, paste a thread)                                | `lead.edit` (with the lead): owner or Admin                                                                                 | Yes   | Own leads only                                 |
| Add a note to the conversation                                                                        | `lead.addNote`                                                                                                              | Yes   | Yes                                            |
| See the Team tab on Today (R8) and the list behind each number (D-043)                                | `today.team`                                                                                                                | Yes   | No                                             |
| Snooze a task to a date; clear a person's Check details flag (D-043)                                  | `lead.edit` (owner or Admin)                                                                                                | Yes   | Own leads                                      |
| Make a report on yourself; open your own reports (F19)                                                | `record.view`                                                                                                               | Yes   | Yes                                            |
| Make a report on the team or anyone; open every report                                                | `reports.team`                                                                                                              | Yes   | No                                             |
| Create, change, run now, switch off or delete scheduled reports                                       | `reports.schedule`                                                                                                          | Yes   | No                                             |
| Reassign the owner of a lead or company (single or bulk); the previous and new owner are told (D-054) | `lead.reassign`                                                                                                             | Yes   | No                                             |
| Add an office to any company (F28)                                                                    | `lead.create`                                                                                                               | Yes   | Yes                                            |
| Edit or delete an office (F28)                                                                        | `lead.edit` with the office's owner or the company's owner                                                                  | Yes   | Offices they own, or at companies they own     |
| Give an office a new owner (F28; both owners are told)                                                | `lead.edit` with the office's owner                                                                                         | Yes   | Offices they own                               |
| Remove a follow-up on Today (D-054)                                                                   | `lead.edit` (owner or Admin)                                                                                                | Yes   | Own leads                                      |
| Set a follow-up from the conversation, with an optional note (D-055)                                  | `lead.edit` (owner or Admin)                                                                                                | Yes   | Own leads                                      |
| Voice typing on the AI text boxes (F29): turns a recording into text, nothing stored                  | signed in (`requireUser`)                                                                                                   | Yes   | Yes                                            |
| Create Official personas, filters and templates; edit and delete them (D-043: no approvals)           | `library.create` (anyone) / `library.edit` / `library.delete` (Official: its creator or an Admin)                           | Yes   | Create yes; edit own. Others' show a lock icon |
| Create, edit and delete own Personal personas, filters and templates                                  | `library.create` / `library.edit` / `library.delete` (Personal item)                                                        | Yes   | Yes, own items only                            |
| View and duplicate anyone's Personal items                                                            | `record.view`, `library.duplicate`                                                                                          | Yes   | Yes                                            |
| Make your own Personal item Official (replaces proposing, D-043)                                      | `library.edit` (own Personal item); `library.propose` is always refused                                                     | Yes   | Yes, own items                                 |
| Create Official or Personal plans; edit, archive and switch the type of your own (F17, D-043)         | `plan.create` (anyone), `plan.edit` (own; Official also Admins)                                                             | Yes   | Yes, own plans                                 |
| Delete a plan (D-045; replaces Archive)                                                               | `plan.edit`                                                                                                                 | Yes   | Own plans                                      |
| Move the people on a plan to its new version when saving (D-043)                                      | `plan.edit`                                                                                                                 | Yes   | Own plans                                      |
| See and use a plan (enrol people)                                                                     | `plan.use`: Official plans for all; Personal for the owner and Admins                                                       | Yes   | Official + own                                 |
| Approve or reject proposals (retired in D-043; the page now opens Plans)                              | `proposal.decide`                                                                                                           | —     | —                                              |
| Read Playbook Settings                                                                                | `settings.read`                                                                                                             | Yes   | Yes                                            |
| Edit Playbook Settings                                                                                | `settings.edit`                                                                                                             | Yes   | No                                             |
| Read AI knowledge files and download sales resources (F20)                                            | `record.view`                                                                                                               | Yes   | Yes                                            |
| Delete people; delete (empty) and merge companies                                                     | `lead.delete`                                                                                                               | Yes   | No                                             |
| Add an industry (F21)                                                                                 | `lead.create`                                                                                                               | Yes   | Yes                                            |
| Rename or delete industries (F21)                                                                     | `settings.edit`                                                                                                             | Yes   | No                                             |
| Chat with the AI on a lead (F23); chats are private to their author                                   | `lead.edit` (owner or Admin)                                                                                                | Yes   | Own leads                                      |
| Calendar: hours, events, cancel and reschedule bookings, Google connection (F22, F26)                 | `calendar.manage` (own calendar; Admins anyone's)                                                                           | Yes   | Own                                            |
| Delete an event for good (D-048)                                                                      | `calendar.manage` (own; Admins anyone's)                                                                                    | Yes   | Own                                            |
| Schedule a meeting with To and CC recipients (D-043)                                                  | `calendar.manage` (own calendar)                                                                                            | Yes   | Yes, on their own calendar                     |
| See any rep's meetings on the calendar (one rep at a time, D-043)                                     | `record.view`                                                                                                               | Yes   | Yes                                            |
| Add or remove guests by email on a meeting (D-045)                                                    | `calendar.manage` on the host, or already on the meeting                                                                    | Yes   | Host or teammate                               |
| Add or remove teammates on a meeting (D-042)                                                          | `calendar.manage` on the host, or already on the meeting                                                                    | Yes   | Host or teammate                               |
| See and mark read notifications (F25)                                                                 | Own notifications only (Admins too)                                                                                         | Own   | Own                                            |
| Book, cancel or reschedule from a booking link (F22)                                                  | None: checked against the link or private code (D-041)                                                                      | —     | Anyone                                         |
| Calendly webhook (F27)                                                                                | None: Calendly's signature (`CALENDLY_WEBHOOK_SIGNING_KEY`); changes are audited as the person's owner or the default Admin | —     | Calendly only                                  |
| Booking reminders (D-043)                                                                             | None: the scheduled job's `CRON_SECRET`                                                                                     | —     | The scheduled job only                         |
| Add and edit AI knowledge files; set the demo calendar link                                           | `knowledge.edit`                                                                                                            | Yes   | No                                             |
| Add and remove sales resources (files and links)                                                      | `resources.manage`                                                                                                          | Yes   | No                                             |
| View the Audit Log                                                                                    | `audit.view`                                                                                                                | Yes   | No. Users see change history on each record    |
| Edit or delete Audit Log entries                                                                      | `audit.modify`                                                                                                              | No    | No                                             |

"Own" means the record's `owner_id` is the signed-in user. `lead.edit` and the `library.*`
actions receive the record so `can()` can check its owner and type.

A deactivated user is refused every action, including reading. `assertCan()` then
answers "Access disabled, contact your admin" instead of "Not allowed".

## Extra guards

- **Deactivated users:** never deleted. They are blocked on every page and action and
  shown "Access disabled, contact your admin". Their login is refused. (Their session is
  kept so the app knows to show that message; it grants nothing, see D-010.)
  They are hidden from owner dropdowns. The Users page lists their open leads for reassignment.
- An Admin cannot deactivate or demote themselves.
- The app never allows zero active Admins.
- Signing up needs an @lumor.tech email (not a default Admin email), or a valid, unexpired,
  unused invite.
- An Admin can generate a password-reset link for any user. That user must then set a new password.
