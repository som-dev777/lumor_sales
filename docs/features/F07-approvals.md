# F07: Approvals

- **Priority:** P1 · **Release:** R2 (v1.1.0) · **Status:** Done (v1.1.0)
- **PRD:** [Screens → Approvals](../PRD.md#screens-and-functional-requirements), [Business rules → Library items](../PRD.md#business-rules)

## What it does

Anyone can propose one of their Personal personas, account filters or templates as Official.
Admins review proposals in one queue and approve or reject them. The person who proposed
sees the outcome.

## Rules

1. **Proposing** (owner of a Personal, non-archived item):
   - creates a Proposal (item type, item, proposed by, proposed at, decision Pending)
   - sets the item's proposal status to **Proposed**
   - can't be done again while a proposal for that item is pending
2. **Approve** (Admin, `proposal.decide`):
   - the item becomes **Official** and **owned by the approving Admin**
   - item proposal status → Approved; Proposal decision → Approved, with decided by/at
   - the original proposer is kept on the Proposal (PRD)
   - an account filter whose code clashes with an existing Official code is refused, with
     a message to rename it first (F05)
3. **Reject** (Admin): optional note (up to 500 characters). Item stays Personal with proposal
   status **Rejected**; Proposal decision → Rejected, with note and decided by/at. The owner
   can edit and propose again.
4. **The proposer sees the outcome:** the item card shows "Approved" or "Rejected" with the
   Admin's note. Personas, Account Filters and Templates also show a "Your proposals" strip
   at the top with the proposer's recent outcomes.
5. If a proposed item is archived, deleted or edited by its owner before a decision, the
   Admin sees its current state. Archiving or deleting withdraws the pending proposal
   (decision Rejected, note "Withdrawn by the owner").
6. **Audit:** proposing writes "Created" (Proposal); approving writes "Approved"; rejecting
   writes "Rejected"; the item's own change (type, owner) is in the same entry's changes.

## Screen: `/approvals` (Admin only; Users get "Not allowed")

- A queue of pending proposals, oldest first: item type, name, proposed by, when, and a
  preview of the item's fields, with **Approve** and **Reject** (optional note).
- A "Recently decided" list below (last 20).
- The sidebar shows the number of pending proposals next to Approvals.
- Empty, loading and error states.

## Tests

- Automated: propose (only own Personal; once while pending); approve makes it Official and
  Admin-owned and keeps the proposer; reject with note; Users can't decide; code clash
  refused; archive withdraws; audit entries.
- Browser (R2 exit check): a User proposes a persona, an Admin approves it, and it shows as
  Official and locked for the User.

## Change history

| Date       | Version    | Change                                                                                                                                                                   |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-16 | 1.1.0      | Placeholder doc created.                                                                                                                                                 |
| 2026-10-16 | 1.1.0      | Full doc written (R2).                                                                                                                                                   |
| 2026-10-16 | 1.1.0      | Propose, approve, reject, withdraw and queue rules built, with tests.                                                                                                    |
| 2026-10-17 | 1.1.0      | Approvals page built: queue with item preview, Approve (confirm) and Reject (optional note), Recently decided, waiting count in the sidebar; R2 exit-check browser test. |
| 2026-10-17 | 1.1.0      | Released in v1.1.0 (R2 Library).                                                                                                                                         |
| 2026-10-18 | Unreleased | v2 (R7): plan proposals are listed in Approvals and decided on the plan page (F17).                                                                                      |
