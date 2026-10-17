# F11: Dashboard

- **Priority:** P0 · **Release:** R4 (v1.3.0) · **Status:** Done (v1.3.0), revised in R7
- **PRD:** [Screens → Dashboard](../PRD.md#screens-and-functional-requirements), [Business rules → Funnel and benchmarks](../PRD.md#business-rules)

## What it does

A weekly or monthly funnel showing where conversion drops, with each step compared to its
benchmark, and the same funnel broken down by persona, level, account filter, template
version, market and rep.

## Rules (v2, from the PRD's Version 2 scope)

1. **Period:** a week (Monday–Sunday, IST) or a calendar month (IST). It defaults to the
   current week. Previous/Next arrows step through periods.
2. **Counted from activities dated inside the period** (events, not a cohort; D-020):

   | Stage             | Counted from                                                                                                                                                               |
   | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Contacted         | each person's **first** outreach touch of any kind (connection request, message, InMail, email, WhatsApp, or a call that connected), if it falls in the period (D-033 F15) |
   | Connected         | "Request accepted" activities                                                                                                                                              |
   | Replied           | each person's first-ever "Reply received", if it falls in the period                                                                                                       |
   | Interested        | "Reply received" with reply type Interested                                                                                                                                |
   | Meeting scheduled | "Meeting booked" activities                                                                                                                                                |
   | Meeting done      | "Meeting held" activities                                                                                                                                                  |
   | Proposal sent     | stage changes to Proposal sent                                                                                                                                             |
   | Trial             | stage changes to Trial                                                                                                                                                     |
   | Paid              | people marked converted (converted date in the period)                                                                                                                     |
   | Active customer   | stage changes to Active customer                                                                                                                                           |

3. **Benchmarks** (carried over to the v2 stages):
   - Contacted → Connected 30%
   - Connected → Replied 10%
   - Interested → Meeting scheduled 50%
   - Meeting scheduled → Meeting done 70%
   - Meeting done → Trial 30%

   Proposal sent and Active customer get benchmarks after 60 days of real data. A conversion
   below its benchmark turns **amber**, but only when the earlier stage has 10 or more in the
   period. With fewer, it's greyed with **"low sample"**.

4. **Breakdowns:** the same counts and conversions per persona, level, account filter,
   template version, market or rep. Leads without a value show as "Not set".
5. **Plans (F17):** for each plan, the people who started it in the period, how many replied
   and converted, and the reply rate. Per step: the touches done in the period and the replies
   that followed them. A reply counts against the step just before it.
6. Everyone can see the dashboard (`record.view`).

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

| Date       | Version | Change                                                                                                                                         |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.3.0   | Placeholder doc created.                                                                                                                       |
| 2026-10-17 | 1.3.0   | Full doc written (R4).                                                                                                                         |
| 2026-10-17 | 1.3.0   | Funnel counting, conversions and breakdowns built and tested on the server.                                                                    |
| 2026-10-17 | 1.3.0   | Dashboard page: period switch, funnel chart, conversion tiles, breakdown table; browser test.                                                  |
| 2026-10-17 | 1.3.0   | Released in v1.3.0 (R4 Daily work).                                                                                                            |
| 2026-10-18 | 2.0.0   | v2 (R7): v2 stages and benchmarks, Contacted = first touch of any kind, Proposal sent and Active customer, plan reply rates per plan and step. |
| 2026-10-18 | 2.0.0   | Released in v2.0.0 (R7 Plans).                                                                                                                 |
