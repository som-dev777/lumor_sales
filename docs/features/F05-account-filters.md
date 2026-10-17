# F05: Account filters

- **Priority:** P0 · **Release:** R2 (v1.1.0) · **Status:** Done (v1.1.0)
- **PRD:** [Screens → Personas and Account Filters](../PRD.md#screens-and-functional-requirements), [Business rules → Library items](../PRD.md#business-rules), [Appendix: seed data](../PRD.md#appendix-seed-data)

## What it does

An account filter is a saved Sales Navigator account search: which companies to look at
(industry, headcount, HQ, keywords, exclusions) and why they matter. Leads and companies
point to the filter they came from, so the team can see which account lists convert.

## Rules

All the **library rules in [F04](F04-personas.md#library-rules-shared-by-personas-account-filters-f05-and-templates-f06)**
apply: Official/Personal tabs, lock for Users, duplicate, propose, archive-not-delete when in
use, live stats, audit. Plus:

- **Code** (e.g. A1): required, up to 10 characters. Official codes are unique (the database
  enforces it). Personal filters may reuse a code. A duplicate's code gets a "-copy" suffix.
  Approving a proposal whose code clashes with an Official one is refused until the code is
  changed.
- Stats count the people (leads) whose account filter is this one, like personas. Companies
  that point to it still block deleting it.

## Fields

| Field             | Rules                                                   |
| ----------------- | ------------------------------------------------------- |
| Code              | required (A1, A2…), unique among Official               |
| Name              | required                                                |
| Industries        | list                                                    |
| Company headcount | text, e.g. "11–500"                                     |
| HQ location       | list, default "India"                                   |
| Key filters       | text (e.g. Sales Navigator keywords or department size) |
| Exclusions        | text                                                    |
| Keywords          | text                                                    |
| Why it matters    | text                                                    |

## Screen: `/account-filters`

Same layout as Personas: tabs, cards with code badge, fields, stats and actions; add/edit
dialog. Cards are sorted by code.

## Seed data (R2)

The 6 Official filters from the PRD appendix (A1 Research Agencies … A6 Consumer & D2C
Brands), with their industries, headcount, key filters and exclusions (A3 and A4 exclude
Market Research, Staffing, Higher Ed, Hospitals, Biotech and Pharma). HQ is India unless
the PRD says otherwise (A6: Bengaluru, Mumbai, Delhi NCR). Loaded by `npm run seed:library`.

## Tests

- Automated: Official code uniqueness (including at approval), Personal code reuse,
  duplicate code suffix, the shared library rules, seed.
- Browser: covered by the R2 exit-check journey.

## Change history

| Date       | Version | Change                                                                                                                                   |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.1.0   | Placeholder doc created.                                                                                                                 |
| 2026-10-16 | 1.1.0   | Full doc written (R2).                                                                                                                   |
| 2026-10-16 | 1.1.0   | Account filter rules (Official code uniqueness, copy codes) built, with tests.                                                           |
| 2026-10-17 | 1.1.0   | Seed: A1–A6 from the PRD (`npm run seed:library`), with tests.                                                                           |
| 2026-10-17 | 1.1.0   | Account Filters page built: tabs, cards (code badge, industries, HQ, filters, exclusions) with stats, add/edit form, the shared actions. |
| 2026-10-17 | 1.1.0   | Released in v1.1.0 (R2 Library).                                                                                                         |
