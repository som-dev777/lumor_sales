# Changelog

All notable changes to Lumor Sales Hub. Versions follow MAJOR.MINOR.PATCH:
MINOR once per release (R1 = 1.0.0, R2 = 1.1.0…), PATCH for fixes.

**Format** (`npm run releases:sync` reads this file into the About page, so keep it exact):

- Work in progress goes under `## [Unreleased]`.
- At a release, rename it to `## [X.Y.Z] - YYYY-MM-DD`.
- The first plain line under a release heading is its one-sentence summary.
- Every `- ` bullet under it is one change.

## [Unreleased]

R1 Foundation, in progress.

- Set up the Next.js project with the R1 packages (Drizzle + libSQL, Better Auth, Zod, React Hook Form, Radix UI, Lucide, TanStack Table, date-fns, SCSS, Vitest, Prettier).
- Added CLAUDE.md standing rules and the environment variable template (.env.example).
- Added the docs system: README with feature index, CHANGELOG, data model, roles and permissions, AI prompts placeholder, decisions, and one doc per feature (F01–F16).
- Added the database: all 12 PRD entities plus login, invite and template-history tables, with allowed-value rules, required lost reason, unique LinkedIn URL, and links that block deleting in-use items.
- Added database locks: the audit log can't be edited or deleted, users can't be deleted, and deactivating a user ends all their sessions.
- Added `npm run db:migrate` (creates data/app.db) and 19 automated database tests.
- Added the core building blocks: India-time date helpers (IST days, Monday–Sunday weeks, months), the one shared permission check (`can()` / `assertCan()`) covering every row of the PRD permission table, and `writeAudit()`, which records before/after values in the same transaction as the change. 38 new automated tests.
- Added the design system and app shell: PRD colours, Inter font and 12px cards as CSS variables; left sidebar with all 11 menu items (current page highlighted, slide-out menu on mobile); placeholder pages showing which release builds each screen; Settings page with Users, Product Facts and Playbook sections; loading, error and "Page not found" screens.
- Branding: the Lumor logo with "Sales Hub" in Bricolage Grotesque replaces the placeholder logo in the sidebar and mobile top bar. Inter remains the font for the rest of the app. Fixed a stray shadow on the left edge on mobile.
- Login and access (F01): email and password login; invite-only registration (links work once, for 7 days); password reset links (work once, for 24 hours); forced password change for the first Admin; "Access disabled, contact your admin" for deactivated users on every page; Users can't see or open Approvals, Audit Log or Settings → Users; the signed-in name, role, Change password and Log out in the sidebar. `npm run seed:admin` creates the first Admin (`-- --reset` if locked out).
- Changed: Better Auth's admin plugin and web endpoints aren't used, and deactivation keeps the session so the "Access disabled" message can show (D-010). Login attempt limiting is still to do before R4 (D-011).
- Sign-up: anyone with an @lumor.tech email can create their own User account at /signup (D-012). Other emails still need an invite.
- Default Admins: `npm run seed:admin` now creates somnath@, arijeet@ and prince@lumor.tech as Admins, with the starting password from `.env.local` and no forced change (D-013). This replaces the earlier single gmail Admin.
- Settings → Users (F01): team table with role, status and open leads; Invite person (copyable link); pending invites with Cancel; Make Admin / Make User; Deactivate / Reactivate; password reset links. Each action asks for confirmation and is recorded in the Audit Log. You can't change your own role or deactivate yourself, and the app always keeps at least one active Admin.
