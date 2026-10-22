# F12: Product Facts

- **Priority:** P0 · **Release:** R5 (v1.4.0) · **Status:** Replaced by F20 AI Resources (v2.1.0)
- **PRD:** [Data model → ProductFacts](../PRD.md#data-model), [Business rules → Product Facts and Playbook Settings](../PRD.md#business-rules)

## What it does

One record holding the only facts the AI may use about Lumor. Every AI feature (R6) reads it
at the moment it runs, so an edit applies straight away. Everyone can read it; only Admins
can edit it. It must be filled in before the AI features are used.

## Fields

| Field             | What goes in it                                                     | Limit                            |
| ----------------- | ------------------------------------------------------------------- | -------------------------------- |
| What Lumor does   | A short plain description of the product                            | 5,000 characters                 |
| Live features     | Features that work today (the AI may mention only these)            | 5,000 characters                 |
| Features not live | Planned or beta features (the AI must never promise these)          | 5,000 characters                 |
| Pricing guidance  | What may be said about price (e.g. "plans start at…; custom = ask") | 5,000 characters                 |
| Positioning rules | How to talk about Lumor and competitors                             | 5,000 characters                 |
| Calendar link     | The demo booking link the AI can share                              | a full `https://` link, or empty |

## Rules

1. Read: everyone (`settings.read`). Edit: Admin only (`settings.edit`), checked on the server.
2. Saving records **last edited by** and **last edited at**, and writes a "Product Facts
   Updated" audit entry with the fields that changed (before and after).
3. Saving with nothing changed doesn't write an audit entry.
4. If **What Lumor does** or **Live features** is empty, the page shows "Not filled in yet:
   the AI features need these before they can be used."

## Screen: `/settings/product-facts`

- Everyone: each field as readable text, with "Last edited by {name} · {date}".
- Admin: an Edit button opens the form (all six fields), with Save and Cancel.
- The change history panel below shows every past edit.

## Tests

- Automated: Admin saves and the audit entry lists the changed fields; Users are refused;
  the calendar link must be https; over-long text is refused; no audit entry when nothing changed.
- Browser (R5 exit check): an Admin edits Product Facts and the change shows for a User and in
  the history; a User sees no Edit button and the server refuses a save.

## Change history

| Date       | Version | Change                                                                                                                  |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.4.0   | Placeholder doc created.                                                                                                |
| 2026-10-17 | 1.4.0   | Full doc written (R5).                                                                                                  |
| 2026-10-17 | 1.4.0   | Rules, page and edit form built (read for all, edit for Admin, audited); R5 browser test.                               |
| 2026-10-17 | 1.4.0   | Released in v1.4.0 (R5 Settings).                                                                                       |
| 2026-10-22 | 2.1.0   | Replaced by F20 AI Resources (D-037): the AI reads the knowledge base instead; the calendar link moves to AI Resources. |
