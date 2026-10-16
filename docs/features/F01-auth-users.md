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

1. **Invite-only signup.** Better Auth's open sign-up is turned off. A server-side backstop
   also refuses to create any user without a valid invite. Invites expire after 7 days and
   work once. Only a hash of the link's secret is stored.
2. **Users page (Admin):** invite (email + role) shows a copyable link. Change role,
   deactivate and reactivate each have a confirm step and write an audit entry
   (Created, Role changed, Deactivated, Reactivated). "Generate reset link" gives a
   copyable password-reset link. The page shows each user's open leads (0 until R3).
3. **Deactivation:** never delete. Setting `active = 0`:
   - deletes the user's sessions (database trigger)
   - makes login refuse them
   - makes every page and server action send them to `/disabled`
   - hides them from owner dropdowns
4. **Guards:** an Admin can't deactivate or demote themselves. The app never has zero
   active Admins. A duplicate email can't be invited.
5. **First Admin:** `npm run seed:admin` creates Somnath (s.chakraborty1409@gmail.com) as
   Admin with a one-time password printed once, and sets `must_change_password = 1`.
6. **Forced password change:** while `must_change_password = 1`, every page and action
   redirects to `/change-password`. Saving clears the flag and writes an audit entry.
7. **Sidebar:** Users don't see Approvals or Audit Log. If they type the address, the server
   shows "Not allowed".

## Tests

- Automated (Vitest):
  - permission table rows for `user.manage`
  - an invite token works once and expires
  - signup without an invite is refused
  - deactivation removes sessions
  - the self-deactivate and last-Admin guards
- Browser (R1 exit check):
  - Admin first login is forced to change password
  - invite a User and register them
  - deactivate them: they're blocked with "Access disabled"
  - reactivate them: they can log in again

## Change history

| Date       | Version    | Change                    |
| ---------- | ---------- | ------------------------- |
| 2026-10-16 | Unreleased | Feature doc written (R1). |
