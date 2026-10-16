# Roles and permissions

Two roles: **Admin** and **User**. Everyone can read everything; each person edits only what
they own. The first Admin is Somnath (s.chakraborty1409@gmail.com).

## How it is enforced

SQLite has no row-level security, and the browser never talks to the database. Every
Server Action and Route Handler runs this sequence on the server:

1. `requireUser()` (`src/lib/session.ts`): signed in, account active, and no forced
   password change pending. Otherwise the user is sent to `/login`, `/disabled` or
   `/change-password`.
2. `assertCan(user, action, resource?)` (`src/lib/permissions.ts`): the **one shared
   permission check**. It refuses with "Not allowed" if the table below says no.
3. The change and `writeAudit()` run in the same database transaction.

Hiding a button in the UI is only a convenience. Database triggers add hard locks for the
audit log, user deletion and deactivation (see [data-model.md](data-model.md#triggers-database-level-locks)).

## Permission table (from the PRD)

| Action key                  | Meaning                                                              | Admin | User                                        |
| --------------------------- | -------------------------------------------------------------------- | ----- | ------------------------------------------- |
| `user.manage`               | Invite users, assign roles, deactivate and reactivate users          | Yes   | No                                          |
| `record.view`               | View all companies, people, activities and dashboards                | Yes   | Yes                                         |
| `lead.editOwn`              | Create, edit and log activity on leads they own                      | Yes   | Yes                                         |
| `lead.noteAny`              | View and add notes on leads owned by others                          | Yes   | Yes                                         |
| `lead.logOutreachOthers`    | Log outreach on leads owned by others                                | Yes   | No. Shows "This lead is claimed by {owner}" |
| `lead.reassign`             | Reassign the owner of a lead or company (single or bulk)             | Yes   | No                                          |
| `library.manageOfficial`    | Create, edit and delete Official personas, filters and templates     | Yes   | No. Official items show a lock icon         |
| `library.manageOwnPersonal` | Create, edit and delete own Personal personas, filters and templates | Yes   | Yes                                         |
| `library.duplicate`         | View and duplicate anyone's Personal items                           | Yes   | Yes                                         |
| `library.propose`           | Propose a Personal item as Official                                  | Yes   | Yes                                         |
| `proposal.decide`           | Approve or reject proposals                                          | Yes   | No                                          |
| `settings.read`             | Read Product Facts and Playbook Settings                             | Yes   | Yes                                         |
| `settings.edit`             | Edit Product Facts and Playbook Settings                             | Yes   | No                                          |
| `audit.view`                | View the Audit Log                                                   | Yes   | No. Users see change history on each record |
| `audit.modify`              | Edit or delete Audit Log entries                                     | No    | No                                          |

"Own" means the record's `owner_id` is the signed-in user. Actions marked "own" receive the
record so `can()` can check ownership.

## Extra guards

- **Deactivated users:** never deleted. They are blocked on every page and action and
  shown "Access disabled, contact your admin". Their sessions are deleted by a trigger.
  They are hidden from owner dropdowns. The Users page lists their open leads for reassignment.
- An Admin cannot deactivate or demote themselves.
- The app never allows zero active Admins.
- Signing up needs a valid, unexpired, unused invite.
- An Admin can generate a password-reset link for any user. That user must then set a new password.
