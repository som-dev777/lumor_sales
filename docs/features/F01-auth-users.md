# F01: Auth and users

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** Done (v1.0.0)
- **PRD:** [Users, roles and permissions](../PRD.md#users-roles-and-permissions), [Screens → Auth, Settings → Users](../PRD.md#screens-and-functional-requirements)

## What it does

People sign in with email and password. Nobody can sign up without an invite from an Admin.
Admins manage the team: invite, change role, deactivate and reactivate. Deactivated users are
blocked everywhere at once.

## Screens

| Path                | Who                   | Purpose                                                               |
| ------------------- | --------------------- | --------------------------------------------------------------------- |
| `/login`            | Signed out            | Email + password sign-in                                              |
| `/signup`           | Signed out            | Self sign-up with an @lumor.tech email, as a User (D-012)             |
| `/register/[token]` | Holder of invite link | Set name and password; email and role come from the invite            |
| `/forgot-password`  | Signed out            | Explains: ask your admin for a reset link (D-002)                     |
| `/reset-password`   | Holder of reset link  | Set a new password                                                    |
| `/change-password`  | Signed in, flag set   | Forced password change (D-006). No other page is reachable until done |
| `/disabled`         | Deactivated user      | "Access disabled, contact your admin"                                 |
| `/settings/users`   | Admin                 | Team list and actions (below)                                         |

## Rules

1. **Getting an account.**
   - **@lumor.tech email:** sign up yourself on `/signup` and get a User account (D-012).
   - **Any other email:** an Admin sends an invite link. Invites expire after 7 days and work
     once, and only a hash of the link's secret is stored.
   - Better Auth's own sign-up is off, and a hook refuses any user creation outside our code.
2. **Users page (Admin, `/settings/users`):**
   - **The team table:** name, email, role, status, open leads (not Paid or Lost) and date
     joined, with "You" on your own row. A deactivated person with open leads is flagged
     "Reassign these leads".
   - **Invite person:** email and role. You get a copyable link that works once, for 7 days.
     For @lumor.tech people, an invite is only needed to make them an Admin straight away.
   - **Pending invites** list, with Cancel invite.
   - **Each person's ⋯ menu:**
     - Make Admin / Make User
     - Create password reset link (copyable; works once, for 24 hours)
     - Deactivate / Reactivate
   - Every action asks for confirmation, refreshes the page, and writes an audit entry:
     Role changed, Deactivated, Reactivated, Invite Created/Updated, or Updated
     (reset link created).
3. **Deactivation:** never delete. Setting `active = 0`:
   - makes login refuse them with "Access disabled, contact your admin"
   - keeps their session, so any page they open shows that message instead of the login
     page (D-010)
   - makes every page and server action send them to `/disabled`
   - hides them from owner dropdowns
4. **Guards:** an Admin can't deactivate or demote themselves. The app never has zero
   active Admins. A duplicate email can't be invited.
5. **Default Admins (D-013):** `npm run seed:admin` creates somnath@, arijeet@ and
   prince@lumor.tech as Admins, with the password in `SEED_ADMIN_PASSWORD` (`.env.local`).
   They can change it from the sidebar whenever they like. Running it again changes nothing.
   `npm run seed:admin -- --reset` puts the starting password back for a locked-out Admin.
   These emails can't be claimed through sign-up.
6. **Forced password change:** while `must_change_password = 1`, every page and action
   redirects to `/change-password`. Saving clears the flag and writes an audit entry.
   Not used for the default Admins (D-013); kept for later use.
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
- `src/server/invites.ts`, `src/server/password-reset.ts`, `src/server/users.ts`,
  `src/server/signup.ts`: invite, reset-link, sign-up and account creation logic.
- `src/server/user-admin.ts` + `src/server/actions/users.ts`: the Users page rules (each
  checks `user.manage` and writes the audit entry).
- `src/app/(app)/settings/users/page.tsx` + `src/components/users/`: the Users page.
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
  - sign-up (`src/server/signup.test.ts`): @lumor.tech only, no look-alikes, default Admin
    emails blocked, one account per email, audited
  - Users page rules (`src/server/user-admin.test.ts`): User refused, role changes,
    deactivate/reactivate, can't change or deactivate yourself, at least one active Admin,
    invites created and cancelled, reset links, open-lead counts
- Browser (R1 exit check):
  - Admin first login is forced to change password
  - invite a User and register them
  - deactivate them: they're blocked with "Access disabled"
  - reactivate them: they can log in again

## Change history

| Date       | Version | Change                                                                                                                            |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.0.0   | Feature doc written (R1).                                                                                                         |
| 2026-10-16 | 1.0.0   | user/session/account/verification/invite tables, no-delete and deactivation triggers added, with tests.                           |
| 2026-10-16 | 1.0.0   | Login, invite registration, reset and forced password change built; admin plugin dropped and deactivation keeps sessions (D-010). |
| 2026-10-16 | 1.0.0   | Self sign-up for @lumor.tech (D-012); three default Admins replace the gmail Admin (D-013).                                       |
| 2026-10-16 | 1.0.0   | Settings → Users page built: invite, pending invites, roles, deactivate/reactivate, reset links, guards.                          |
| 2026-10-16 | 1.0.0   | Released in v1.0.0 (R1 Foundation).                                                                                               |
