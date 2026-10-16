# Roles and permissions

Two roles: **Admin** and **User**. Everyone can read everything; each person edits only what
they own. The first Admin is Somnath (s.chakraborty1409@gmail.com).

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

| PRD row                                                              | Action key(s)                                                        | Admin | User                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----- | ------------------------------------------- |
| Invite users, assign roles, deactivate and reactivate users          | `user.manage`                                                        | Yes   | No                                          |
| View all companies, people, activities and dashboards                | `record.view`                                                        | Yes   | Yes                                         |
| Create, edit and log activity on leads they own                      | `lead.create`, `lead.edit` (with the lead)                           | Yes   | Yes                                         |
| View and add notes on leads owned by others                          | `record.view`, `lead.addNote`                                        | Yes   | Yes                                         |
| Log outreach on leads owned by others                                | `lead.edit` (with the lead): owner or Admin                          | Yes   | No. Shows "This lead is claimed by {owner}" |
| Reassign the owner of a lead or company (single or bulk)             | `lead.reassign`                                                      | Yes   | No                                          |
| Create, edit and delete Official personas, filters and templates     | `library.create` / `library.edit` / `library.delete` (Official item) | Yes   | No. Official items show a lock icon         |
| Create, edit and delete own Personal personas, filters and templates | `library.create` / `library.edit` / `library.delete` (Personal item) | Yes   | Yes, own items only                         |
| View and duplicate anyone's Personal items                           | `record.view`, `library.duplicate`                                   | Yes   | Yes                                         |
| Propose a Personal item as Official                                  | `library.propose` (own Personal item)                                | Yes   | Yes                                         |
| Approve or reject proposals                                          | `proposal.decide`                                                    | Yes   | No                                          |
| Read Product Facts and Playbook Settings                             | `settings.read`                                                      | Yes   | Yes                                         |
| Edit Product Facts and Playbook Settings                             | `settings.edit`                                                      | Yes   | No                                          |
| View the Audit Log                                                   | `audit.view`                                                         | Yes   | No. Users see change history on each record |
| Edit or delete Audit Log entries                                     | `audit.modify`                                                       | No    | No                                          |

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
- Signing up needs a valid, unexpired, unused invite.
- An Admin can generate a password-reset link for any user. That user must then set a new password.
