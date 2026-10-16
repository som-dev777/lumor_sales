# F01: Auth and users

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** In progress
- **PRD:** [Users, roles and permissions](../PRD.md#users-roles-and-permissions), [Screens → Auth, Settings → Users](../PRD.md#screens-and-functional-requirements)

## What it does

People sign in with email and password. Nobody can sign up without an invite from an Admin.
Admins manage the team: invite, change role, deactivate and reactivate. Deactivated users are
blocked everywhere at once.

## Screens

| Path                | Who                   | Purpose                                                               |
| ------------------- | --------------------- | --------------------------------------------------------------------- |
| `/login`            | Signed out            | Email + password sign-in                                              |
| `/register/[token]` | Holder of invite link | Set name and password; email and role come from the invite            |
| `/forgot-password`  | Signed out            | Explains: ask your admin for a reset link (D-002)                     |
| `/reset-password`   | Holder of reset link  | Set a new password                                                    |
| `/change-password`  | Signed in, flag set   | Forced password change (D-006). No other page is reachable until done |
| `/disabled`         | Deactivated user      | "Access disabled, contact your admin"                                 |
| `/settings/users`   | Admin                 | Team list and actions (below)                                         |

## Rules

1. **Invite-only signup.** Better Auth's open sign-up is turned off, and a Better Auth hook
   refuses to create any user at all. Accounts are only created by our own code: invite
   registration and the seed script (D-010). Invites expire after 7 days and
   work once. Only a hash of the link's secret is stored.
2. **Users page (Admin):** invite (email + role) shows a copyable link. Change role,
   deactivate and reactivate each have a confirm step and write an audit entry
   (Created, Role changed, Deactivated, Reactivated). "Generate reset link" gives a
   copyable password-reset link. The page shows each user's open leads (0 until R3).
3. **Deactivation:** never delete. Setting `active = 0`:
   - makes login refuse them with "Access disabled, contact your admin"
   - keeps their session, so any page they open shows that message instead of the login
     page (D-010)
   - makes every page and server action send them to `/disabled`
   - hides them from owner dropdowns
4. **Guards:** an Admin can't deactivate or demote themselves. The app never has zero
   active Admins. A duplicate email can't be invited.
5. **First Admin:** `npm run seed:admin` creates Somnath (s.chakraborty1409@gmail.com) as
   Admin with a one-time password printed once, and sets `must_change_password = 1`.
   Running it again changes nothing. If the Admin is locked out,
   `npm run seed:admin -- --reset` gives a new one-time password and logs them out everywhere.
6. **Forced password change:** while `must_change_password = 1`, every page and action
   redirects to `/change-password`. Saving clears the flag and writes an audit entry.
7. **Sidebar:** Users don't see Approvals or Audit Log. If they type the address, the server
   shows "Not allowed". The sidebar shows the signed-in name, role, Change password and Log out.
8. **Passwords:** 10–128 characters. Reset links (made by an Admin) work once, for 24 hours,
   and log the person out everywhere else. A password change logs out other devices.
   The audit log records that a password changed, never the password.

## How it works

- `src/lib/auth.ts`: Better Auth setup. Its web endpoints aren't mounted.
- `src/proxy.ts`: no login cookie → `/login?next=…` (fast first check only).
- `src/lib/session.ts`: `getViewer()` and `requireUser()`, the checks every page and action
  starts with.
- `src/server/actions/auth.ts`: Server Actions for login, logout, register, reset and change
  password.
- `src/server/invites.ts`, `src/server/password-reset.ts`, `src/server/users.ts`: invite,
  reset-link and account creation logic.
- `scripts/seed-admin.ts`: the first Admin.

## Tests

- Automated (Vitest, `src/server/auth-flows.test.ts`):
  - login with the right and wrong password
  - deactivated user refused
  - Better Auth sign-up refused
  - an invite works once, expires after 7 days, can't reuse an existing email, and stores
    only a hash
  - audit entries for the invite and the new account
  - reset links work once and enforce the password length
  - (Step 8) the self-deactivate and last-Admin guards
- Browser (R1 exit check):
  - Admin first login is forced to change password
  - invite a User and register them
  - deactivate them: they're blocked with "Access disabled"
  - reactivate them: they can log in again

## Change history

| Date       | Version    | Change                                                                                                                            |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | Unreleased | Feature doc written (R1).                                                                                                         |
| 2026-10-16 | Unreleased | user/session/account/verification/invite tables, no-delete and deactivation triggers added, with tests.                           |
| 2026-10-16 | Unreleased | Login, invite registration, reset and forced password change built; admin plugin dropped and deactivation keeps sessions (D-010). |
