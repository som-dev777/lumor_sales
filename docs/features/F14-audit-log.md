# F14: Audit Log

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** In progress
- **PRD:** [Business rules → Audit Log](../PRD.md#business-rules), [Screens → Audit Log](../PRD.md#screens-and-functional-requirements)

## What it does

Records every change to the data: who did it, when, which record, and each changed field's
before and after values. Nobody can edit or delete an entry, not even an Admin.

## Rules

1. **One writer.** Every create, edit, delete, approval, rejection, reassignment, role
   change, deactivation and reactivation calls `writeAudit()` (`src/lib/audit.ts`). It runs
   in the same database transaction as the change itself: if one fails, neither is saved.
2. **What's recorded:**
   - date-time
   - user (empty for system actions)
   - entity type
   - record name and ID
   - action: Created, Updated, Deleted, Approved, Rejected, Reassigned, Role changed,
     Deactivated or Reactivated
   - `changes` JSON with `{ field: { before, after } }` for changed fields only
3. **Insert-only, in the database.** The SQLite triggers `audit_log_no_update` and
   `audit_log_no_delete` reject any update or delete with "audit_log is insert-only".
4. **Secrets are never logged.** Password hashes and tokens are left out of `changes`.

## Screens

- **`/audit-log` (Admin only):**
  - searchable table, newest first
  - filters: user, entity type, action and date range (IST)
  - expandable before/after detail for each entry
  - **Export CSV** of the filtered view
  - no edit or delete control anywhere
- **Change history panel** (`ChangeHistory` component): every record's detail page shows
  that record's own audit entries. Users see this; only Admins see the full log.
  Used from R2 onwards.

## Tests

- Automated (Vitest):
  - `writeAudit()` records only changed fields, with correct before/after values
  - secrets are left out
  - UPDATE and DELETE on audit_log throw
  - the change and the audit entry roll back together
- Browser (R1 exit check):
  - entries appear for the invite, registration, deactivation and reactivation
  - no edit or delete control
  - filters and CSV export work
  - a direct database update attempt fails

## Change history

| Date       | Version    | Change                                                                                                       |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-10-16 | Unreleased | Feature doc written (R1).                                                                                    |
| 2026-10-16 | Unreleased | audit_log table and insert-only triggers added, with tests.                                                  |
| 2026-10-16 | Unreleased | writeAudit() and diffChanges() added: changed fields only, secrets left out, saved together with the change. |
