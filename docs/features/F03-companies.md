# F03: Companies

- **Priority:** P0 · **Release:** R3 (v1.2.0) · **Status:** Done (v1.2.0)
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
4. **Notes** are edited in place on the company page (**Add notes** / **Edit notes**) by the
   owner or an Admin (D-040).
5. **Add person** in the company page's People panel opens the person form with this company
   filled in.
6. **Deleting and merging (Admins, `lead.delete`; D-040):**
   - **Delete** only works when the company has no people ("Merge it into another company, or
     delete them first").
   - **Merge** (for duplicates) moves its people and their history to the chosen company,
     fills that company's empty details from it, keeps its notes ("Merged from …"), keeps the
     further status (Customer > Engaged > Target > Lost) with its deal, then deletes it. Both
     companies get an audit entry.
7. **Industry** is picked from the Industries list (F21), with **+ Add a new industry**.
8. Every change is audited.

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

| Date       | Version | Change                                                                                                                                                                                                                                                  |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.2.0   | Placeholder doc created.                                                                                                                                                                                                                                |
| 2026-10-17 | 1.2.0   | Full doc written (R3).                                                                                                                                                                                                                                  |
| 2026-10-17 | 1.2.0   | Rules built: unique names, create/edit, mark as customer, lists, combined timeline; with tests.                                                                                                                                                         |
| 2026-10-17 | 1.2.0   | Companies list and company page (deal, people, combined timeline, mark as customer, history) built.                                                                                                                                                     |
| 2026-10-17 | 1.2.0   | Released in v1.2.0 (R3 Leads).                                                                                                                                                                                                                          |
| 2026-10-30 | 2.4.0   | Add person from the company page; editable notes; Admins delete (when empty) and merge companies; Industry from the shared list (F21) (D-040).                                                                                                          |
| 2026-10-30 | 2.4.0   | Released in v2.4.0 (QA round 1).                                                                                                                                                                                                                        |
| 2026-11-02 | 2.5.0   | **Fill with AI** on the company form (F24).                                                                                                                                                                                                             |
| 2026-11-02 | 2.5.0   | Released in v2.5.0.                                                                                                                                                                                                                                     |
| 2026-11-03 | 2.7.0   | A **Backlog** column (people with a backlog, F08) written (D-043), before code.                                                                                                                                                                         |
| 2026-11-03 | 2.7.0   | Built: Backlog column (people with a backlog).                                                                                                                                                                                                          |
| 2026-11-03 | 2.7.0   | Released in v2.7.0 (D-043).                                                                                                                                                                                                                             |
| 2026-11-04 | 2.8.0   | Offices (F28); Ask AI about this company in the company form (P10); a refused save (for example "already exists") shows next to the buttons; a new owner and the previous one are notified (D-054).                                                     |
| 2026-11-04 | 2.9.0   | A–Z by default; Sort by (name, activity, added, backlog, people); Needs action filter (backlog, no activity in 30 days, active in 7 days, no people); Last activity column; filters in a slim bar with chips; mic on Ask AI about this company (D-055). |
