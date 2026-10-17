# F11: Dashboard

- **Priority:** P0 · **Release:** R4 (v1.3.0) · **Status:** In progress
- **PRD:** [Screens → Dashboard](../PRD.md#screens-and-functional-requirements), [Business rules → Funnel and benchmarks](../PRD.md#business-rules)

## What it does

A weekly or monthly funnel showing where conversion drops, with each step compared to its
benchmark, and the same funnel broken down by persona, level, account filter, template
version, market and rep.

## Rules (from the PRD)

1. **Period:** a week (Monday–Sunday, IST) or a calendar month (IST). It defaults to the
   current week. Previous/Next arrows step through periods.
2. **Counted from activities dated inside the period** (events, not a cohort; D-020):

   | Stage         | Counted from                                                         |
   | ------------- | -------------------------------------------------------------------- |
   | Requests sent | "Request sent" activities                                            |
   | Accepted      | "Request accepted" activities                                        |
   | Replied       | each person's first-ever "Reply received", if it falls in the period |
   | Interested    | "Reply received" with reply type Interested                          |
   | Demo booked   | "Demo booked" activities                                             |
   | Demo held     | "Demo held" activities                                               |
   | Trial         | "Stage change" activities to Trial/Pilot                             |
   | Paid          | people marked converted (converted date in the period)               |

3. **Benchmarks:**
   - Requests → Accepted 30%
   - Accepted → Replied 10%
   - Interested → Demo booked 50%
   - Demo booked → Demo held 70%
   - Demo held → Trial 30%

   A conversion below its benchmark turns **amber**, but only when the earlier stage has 10 or
   more in the period. With fewer than 10, the percentage is **greyed with "low sample"**, so
   "1 of 2" isn't read as a trend.

4. **Breakdowns:** the same counts and the five conversions per persona, level, account filter,
   template version (the lead's opener template and A/B/C), market, or rep (the person who
   logged the activity). Leads without a value show as "Not set".
5. Everyone can see the dashboard (`record.view`).

## Screen: `/dashboard`

- Week/Month switch, previous/next period, the period's dates
- funnel as a bar chart (Recharts) with the count on each bar
- the five conversions as tiles (percentage, "x of y", benchmark; amber or low sample)
- a breakdown table with a "Break down by" selector

## Tests

- Automated:
  - each stage count, including "first reply per person" across periods and converted dates
  - IST week and month edges
  - conversions, amber and low sample at the 10 threshold
  - breakdowns by each dimension, with "Not set"
- Browser (R4 exit check): one lead walked to Paid is counted at every stage.

## Change history

| Date       | Version    | Change                   |
| ---------- | ---------- | ------------------------ |
| 2026-10-16 | Unreleased | Placeholder doc created. |
| 2026-10-17 | Unreleased | Full doc written (R4).   |
