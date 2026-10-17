# F03: Companies

- **Priority:** P0 · **Release:** R3 (v1.2.0) · **Status:** In progress
- **PRD:** [Screens → Companies](../PRD.md#screens-and-functional-requirements)

## What it does

Every company the team works with: its people, everything that happened with them, and the
deal once they become a customer.

## Rules

1. **Fields:**
   - name (required, unique case-insensitively, so typing a name on a person links the
     existing company)
   - website, LinkedIn URL, industry, headcount band, city, country (default India)
   - account filter, owner
   - status: Target, Engaged, Customer or Lost
   - plan or tier, deal value (INR, whole rupees; D-020), customer start date (IST), notes
2. **Edit:** the owner or an Admin (`lead.edit`). Admins can reassign the owner.
3. **Mark as customer:** records plan, deal value and start date and sets status to Customer,
   in one audited step. Offered from the company page, and after "Mark converted" on a
   person (R4).
4. **Deleting** isn't offered; companies are kept for history (their people point to them).
5. Every change is audited.

## Screens

- **`/companies`:** a table with name, status, owner, account filter, number of people and
  city; filters for status, owner and account filter; search by name; Add company.
- **`/companies/[id]`:**
  - the company's fields and deal (plan, deal value in ₹, customer since)
  - Edit; Mark as customer
  - linked people (with stage and owner)
  - a combined timeline of all their people's activities, newest first, with meeting notes
    included
  - change history

## Tests

- Automated: create/edit permissions, unique name (case-insensitive), mark as customer sets
  all fields and status, combined timeline, people counts.
- Browser: covered by the R3 journey (company created from a person, mark as customer).

## Change history

| Date       | Version    | Change                   |
| ---------- | ---------- | ------------------------ |
| 2026-10-16 | Unreleased | Placeholder doc created. |
| 2026-10-17 | Unreleased | Full doc written (R3).   |
