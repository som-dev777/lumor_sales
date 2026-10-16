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
