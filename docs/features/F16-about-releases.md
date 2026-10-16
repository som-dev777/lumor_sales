# F16: About and releases

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** In progress
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
   - a test checks that it matches the newest released CHANGELOG heading
   - the release step also checks that it matches the newest `app_release` row
4. **CHANGELOG format:** see the top of CHANGELOG.md. The parser is strict and tested.

## Screen

- **`/about`:**
  - "Lumor Sales Hub v1.0.0" header
  - the latest 5 releases, newest first
  - empty state ("No releases recorded yet")
  - error state

## Tests

- Automated (Vitest):
  - the CHANGELOG parser (summary line, bullets, skipping Unreleased, bad headings)
  - the sync adds only missing versions
  - the version in package.json matches the newest CHANGELOG release
- Browser (R1 exit check): About shows v1.0.0 and its changes.

## Change history

| Date       | Version    | Change                    |
| ---------- | ---------- | ------------------------- |
| 2026-10-16 | Unreleased | Feature doc written (R1). |
