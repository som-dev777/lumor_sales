# F14: Audit Log

- **Priority:** P0 · **Release:** R1 (v1.0.0) · **Status:** Done (v1.0.0)
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

- **`/audit-log` (Admin only; Users see "Not allowed"):**
  - A table, 50 entries per page, newest first: when (IST), who ("System" for the seed
    script), action, record, and a one-line summary. New records list their values;
    changes show before → after.
  - Click the arrow on a row to see every changed field's before (red) and after (green).
  - Filters (in the page address, so a view can be bookmarked):
    - search across names, emails, record names and values
    - user (including System)
    - type
    - action
    - From and To dates (IST, both included)
  - **Export CSV** downloads exactly the filtered view (up to 50,000 rows), from
    `/audit-log/export`. It's Admin only, checked on the server. Spreadsheet formulas are
    defused, and it opens correctly in Excel.
  - No edit or delete control anywhere.
- **Change history panel** (`src/components/audit/ChangeHistory.tsx`): a record's own audit
  entries, for detail pages from R2 on. Everyone can see it; only Admins see the full log.
- **`npm run audit:check-lock`:** tries to edit and delete entries directly in the database
  and shows that both are refused.

## How it works

- `src/lib/audit.ts`: `writeAudit()` and `diffChanges()`.
- `src/server/audit-query.ts`: search, filters, export and per-record history (read-only).
- `src/lib/audit-format.ts`: readable labels and values.
- `src/lib/csv.ts`: safe CSV files.
- `src/components/audit/`: the table (TanStack Table), filters, details and history.

## Tests

- Automated (Vitest):
  - `writeAudit()` records only changed fields, with correct before/after values
  - secrets are left out
  - UPDATE and DELETE on audit_log throw
  - the change and the audit entry roll back together
  - search and every filter, including IST date boundaries and paging
  - per-record history
  - CSV quoting and formula defusing
  - readable formatting
- Browser (R1 exit check):
  - entries appear for the invite, registration, deactivation and reactivation
  - no edit or delete control
  - filters and CSV export work
  - a direct database update attempt fails

## Change history

| Date       | Version    | Change                                                                                                                                |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.0.0      | Feature doc written (R1).                                                                                                             |
| 2026-10-16 | 1.0.0      | audit_log table and insert-only triggers added, with tests.                                                                           |
| 2026-10-16 | 1.0.0      | writeAudit() and diffChanges() added: changed fields only, secrets left out, saved together with the change.                          |
| 2026-10-16 | 1.0.0      | Audit Log page, filters, CSV export, change history panel and lock-check command built.                                               |
| 2026-10-16 | 1.0.0      | Released in v1.0.0 (R1 Foundation).                                                                                                   |
| 2026-10-17 | Unreleased | Readable history: record ids shown as names (owner, company, persona…), plain labels ("Owner" not "Owner id"), empty fields left out. |
