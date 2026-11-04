# F28: Company offices

- **Priority:** P1 · **Release:** v2.8.0 · **Status:** Done (2.8.0)
- **Decisions:** D-054

## What it does

A company can have several offices: one main (corporate) office, for example in the UK, and
others, for example in Bangalore, Mumbai and Delhi. Each person can be linked to the office they
work from. Different reps can add the company, its offices and its people, and the app always
shows who added each one and who owns it.

## Rules

- **Offices:** each has a name (for example "Corporate office" or "Bangalore office"), a city,
  a country, an optional address, and whether it's the **main office**. A company has at most one
  main office; marking another as main moves the mark.
- **Who adds:** any active user can add an office to any company. The office's owner is the rep
  who added it, unless an Admin picks someone else.
- **Who edits:** the office's owner, the company's owner or an Admin can edit or delete it. The
  owner of an office can be changed by its owner or an Admin.
- **People:** the person form has an **Office** choice listing the offices of the chosen company
  (optional). An office from another company is refused. Changing a person's company clears an
  office that doesn't belong to the new company. An office with people can't be deleted.
- **Mixed ownership is fine:** for example the main office added by rep A, a sub-office by rep B,
  and a person at rep B's office owned by rep C.
- **Always shown:** the company page lists each office with its people count, "Added by" and
  "Owner". The person page shows their office and who added them.
- **Owner changes notify:** when an office, a person or a company gets a new owner, the previous
  owner and the new owner each get a notification saying who changed it (not the person who made
  the change). Every change is audited.

## Data

New table `company_office`: company_id, name, city, country, address, is_main, owner_id, plus
the standard id, created/updated times and created_by. New column `person.office_id`.

## Tests

- Automated: add offices by different reps; one main office per company; a person linked to an
  office of their company, refused for another company's office, cleared when the company
  changes; edit and delete rules; an office with people can't be deleted; owner changes notify
  the previous and new owners (office, person, company); audit entries.
- Browser: add a main office and a Bangalore office on a company page, link a person to the
  Bangalore office, and see "Added by" and "Owner" on the company page.

## Change history

| Date       | Version | Change                                                                                                                                                                                               |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-04 | 2.8.0   | Feature doc written (before code), D-054.                                                                                                                                                            |
| 2026-11-04 | 2.8.0   | Built and released: offices on the company page, the Office choice on people, owner-change notifications for offices, people and companies; offices move with a merge and go with a deleted company. |
