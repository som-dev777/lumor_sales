# F13: Playbook Settings

- **Priority:** P0 · **Release:** R5 (v1.4.0) · **Status:** In progress
- **PRD:** [Data model → PlaybookSettings](../PRD.md#data-model), [Business rules → Product Facts and Playbook Settings](../PRD.md#business-rules)

## What it does

One record of the numbers the playbook runs on. Quick-log (F15) uses the delays to set
follow-up dates; the Today page (R6) uses the targets and the stale-lead threshold.
Everyone can read it; only Admins can edit it.

## Fields and limits

| Field                                        | Default    | Allowed                     |
| -------------------------------------------- | ---------- | --------------------------- |
| Follow-up 1 delay (days after Message 1)     | 4          | 1–60                        |
| Follow-up 2 delay (days after Message 1)     | 7          | 1–60, more than Follow-up 1 |
| Break-up delay (days after Message 1)        | 10         | 1–90, more than Follow-up 2 |
| Withdraw an unaccepted request after (days)  | 14         | 1–90                        |
| Daily connection request target              | 20         | 0–200                       |
| Daily new-message target                     | 10 (D-007) | 0–200                       |
| Stale-lead threshold (days with no activity) | 21         | 1–365                       |

## Rules

1. Read: everyone (`settings.read`). Edit: Admin only (`settings.edit`), checked on the server.
2. All delays count from the Message 1 date (D-020), so they must go up in order:
   Follow-up 1 < Follow-up 2 < Break-up.
3. A change applies to quick-logs from then on. Next-action dates already set on leads are
   not recalculated.
4. Saving writes a "Playbook Settings Updated" audit entry with the changed numbers. Saving with
   nothing changed writes nothing.

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
| 2026-10-16 | Unreleased | Placeholder doc created.                                                                                |
| 2026-10-17 | Unreleased | Full doc written (R5).                                                                                  |
| 2026-10-17 | Unreleased | Rules, page and edit form built (limits, delays in order, audited); used by quick-log; R5 browser test. |
