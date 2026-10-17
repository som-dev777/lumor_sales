# F13: Playbook Settings

- **Priority:** P0 · **Release:** R5 (v1.4.0) · **Status:** Done (v1.4.0), revised in R7
- **PRD:** [Data model → PlaybookSettings](../PRD.md#data-model), [Business rules → Product Facts and Playbook Settings](../PRD.md#business-rules)

## What it does

One record of the numbers the playbook runs on. Quick-log (F15) uses the delays to set
follow-up dates; the Today page (R6) uses the targets and the stale-lead threshold.
Everyone can read it; only Admins can edit it.

## Fields and limits (v2)

| Field                                                          | Default    | Allowed                        |
| -------------------------------------------------------------- | ---------- | ------------------------------ |
| Withdraw an unaccepted request after (days)                    | 14         | 1–90                           |
| Daily connection request target                                | 20         | 0–200                          |
| Daily new-message target                                       | 10 (D-007) | 0–200                          |
| Stale-lead threshold (days, people not on a plan)              | 21         | 1–365                          |
| Message after accepting: at least / at most (guardrail 1)      | 1 / 3      | 0–14, min ≤ max                |
| Smallest gap between touches (guardrail 2)                     | 3          | 1–30                           |
| Follow-ups after Message 1 (guardrail 3)                       | 4          | 1–10                           |
| Touches in any 7 days (guardrail 4)                            | 2          | 1–7                            |
| Outreach plan length / for Vice President or CXO (guardrail 7) | 30 / 45    | 7–120 / 7–180, normal ≤ senior |
| Nurture period (days)                                          | 60         | 1–365                          |
| AI reply deadline: shortest / longest (F18, from R8)           | 1 / 10     | 1–30, min ≤ max                |

The v1 follow-up delays (4/7/10 days) were removed: each plan step has its own wait (D-032).

## Rules

1. Read: everyone (`settings.read`). Edit: Admin only (`settings.edit`), checked on the server.
2. A change applies from then on. Plan dates already set are not recalculated.
3. Saving writes a "Playbook Settings Updated" audit entry with the changed numbers. Saving
   with nothing changed writes nothing.

## Screen: `/settings/playbook`

- Everyone: the numbers, each with a one-line explanation.
- Admin: an Edit button opens the form, with Save and Cancel; errors show under each field.
- The change history panel below shows every past edit.

## Tests

- Automated: Admin saves and the audit entry lists changes; Users are refused; order of
  delays enforced; limits enforced; a new delay is used by the next quick-log.
- Browser (R5 exit check): an Admin changes Follow-up 1 to 3 days, and a Message 1 logged
  afterwards gets its follow-up 3 days later.

## Change history

| Date       | Version    | Change                                                                                                  |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.4.0      | Placeholder doc created.                                                                                |
| 2026-10-17 | 1.4.0      | Full doc written (R5).                                                                                  |
| 2026-10-17 | 1.4.0      | Rules, page and edit form built (limits, delays in order, audited); used by quick-log; R5 browser test. |
| 2026-10-17 | 1.4.0      | Released in v1.4.0 (R5 Settings).                                                                       |
| 2026-10-18 | Unreleased | v2 (R7): follow-up delays removed; cadence guardrail values and AI reply-deadline bounds added.         |
