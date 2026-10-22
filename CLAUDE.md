# Lumor Sales Hub: standing rules for every Claude Code session

The owner is not a developer. Always explain what you did and what to do next
in plain language, with exact clicks or commands.

Source of truth: docs/PRD.md. Read the relevant section before building any feature.
Where this file and the PRD disagree, this file wins and the reason is in docs/decisions.md.

This project uses a newer Next.js than you may know. Read the note below and the
guides in node_modules/next/dist/docs/ before writing Next.js code.
@AGENTS.md

## Stack (do not change without a decision record)

Next.js (App Router) + TypeScript · SQLite via Drizzle ORM + libSQL client
(local file data/app.db; Turso in production) · Better Auth · SCSS modules with
CSS variables (no Tailwind, no inline styles) · Radix UI · Lucide icons ·
React Hook Form + Zod · TanStack Table · Recharts · date-fns + date-fns-tz
(Asia/Kolkata) · Vitest + Playwright · ESLint + Prettier · OpenAI API
(server-side only; D-036) · Resend (planned) · Node.js 22+. Hosting: Netlify.
All dates are stored in UTC and shown in IST. Weeks run Monday to Sunday.

## Data changes

- Every create, update, delete, approval, rejection, reassignment, role change,
  deactivation and reactivation goes through ONE server action pattern:
  requireUser() → assertCan() from src/lib/permissions.ts → the change and
  writeAudit() from src/lib/audit.ts in the SAME database transaction.
- No data change anywhere else: no direct DB writes from pages or components,
  no client-side DB access.
- Never add code that updates or deletes audit_log rows. Database triggers block it.
- Hiding a button is never the only protection. The server check is the rule.

## Secrets

- Secrets live only in .env.local (never committed). .env.example lists every
  variable name with a fake value. Add new variables to both.
- data/ and .env.local must stay in .gitignore.
- Never print secrets in logs, docs or chat.

## Documentation and versioning (every change, in the same step)

1. Update the feature's doc in docs/features/ and its change-history section.
2. Add a CHANGELOG.md entry (under "Unreleased" until a release).
3. Versioning: bump MINOR once per completed release (R1 = 1.0.0, R2 = 1.1.0…)
   and PATCH for fixes. Version 2 starts at R7 = 2.0.0, then MINOR again (AI Resources = 2.1.0,
   R8 = 2.2.0, R9 = 2.3.0; D-028, D-037). Do not bump the version on every commit.
4. Update docs/README.md (feature index) if anything changed there.
5. At a release or patch, add the AppRelease record (run `npm run releases:sync`).
6. Record significant choices in docs/decisions.md.

- A new feature gets the next F-number and its doc BEFORE any code is written.
- docs/data-model.md and docs/roles-permissions.md must match the code.
- AI prompts are stored word for word, with version numbers, in docs/ai-prompts.md.

## Done means tested

- Run `npm test`, `npm run typecheck` and `npm run lint` before saying something
  is done. Check real exit codes; never hide a failure behind a pipe.
  Report failures honestly, with the output.
- New business rules get a Vitest test.
- Before every release, also run `npm run test:e2e` (the browser tests in e2e/). Each
  release's exit check gets a browser test.
- Then tell the owner exactly what to check in the browser.

## Commits

- Commit after every working step, with a clear message, then push to origin/main.
  Never commit failing code.
- Never create a GitHub repository. Push only to the existing remote
  (`git remote -v`). If none is set, ask the owner for the URL first.
- Never commit .env.local or anything in data/.

## Working pace

Work in phases: one phase = one release (R2, R3…). Build a phase's steps one after
another without waiting for a go-ahead, committing and pushing after each working step,
and tag each release. By default, stop at the end of each phase with a plain-language
summary and the browser checklist for its exit check.

Current (2026-10-22): building AI Resources (F20, v2.1.0) in one go, then stop with a summary.
The owner runs R7's exit check and the QA checklist after it. R8 starts on the owner's go-ahead.
