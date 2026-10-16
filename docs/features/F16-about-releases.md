# F16: About and releases

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** Done (v1.0.0)
- **PRD:** [Screens → About](../PRD.md#screens-and-functional-requirements), [Documentation and versioning](../PRD.md#non-functional-requirements-and-stack)

## What it does

The About page shows the app's current version and its latest 5 releases, each with date,
summary and list of changes. Everyone can see it.

## Rules

1. **Source:** the `app_release` table (version, release date, summary, changes).
2. **Filling it:** `npm run releases:sync` reads [CHANGELOG.md](../CHANGELOG.md) and adds
   any released version that isn't in the table yet. "Unreleased" is skipped. Existing
   rows are not changed. Run it at every release or patch (D-004).
3. **Current version:**
   - comes from `package.json`
   - a test checks that it matches the newest released CHANGELOG heading (or is 0.x before
     the first release)
   - the newest release that matches it gets a "Current" badge
4. **Ordering:** newest first by version number (1.10.0 comes before 1.9.0). At most 5 are shown.
5. **Audit:** each release added by the sync writes an "AppRelease Created" audit entry
   (System).
6. **CHANGELOG format:** see the top of CHANGELOG.md. The parser is strict: a malformed
   heading, a missing date or summary, a release with no bullets, or a version listed twice
   is an error naming the line, so a typo can't silently drop a release.

## How it works

- `src/server/releases.ts`: CHANGELOG parser, sync and latest-releases query.
- `scripts/sync-releases.ts`: `npm run releases:sync`.
- `src/lib/version.ts`: the current version from package.json.
- `src/app/(app)/about/page.tsx`: the page. Everyone signed in can see it.
- At R4, the deploy step will run `releases:sync` against Turso after migrations.

## Screen

- **`/about`:**
  - "Lumor Sales Hub v1.0.0" header
  - the latest 5 releases, newest first
  - empty state ("No releases recorded yet")
  - error state

## Tests

- Automated (Vitest):
  - the CHANGELOG parser (summary line, wrapped bullets, skipping Unreleased, bad headings,
    missing date or summary, duplicates)
  - the sync adds only missing versions, audited, at most 5 shown, version order
  - the real CHANGELOG parses, and package.json's version matches it
- Browser (R1 exit check): About shows v1.0.0 and its changes.

## Change history

| Date       | Version | Change                                                          |
| ---------- | ------- | --------------------------------------------------------------- |
| 2026-10-16 | 1.0.0   | Feature doc written (R1).                                       |
| 2026-10-16 | 1.0.0   | About page, CHANGELOG parser and `npm run releases:sync` built. |
| 2026-10-16 | 1.0.0   | Released in v1.0.0 (R1 Foundation).                             |
