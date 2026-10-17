# F10: Conversation summary and draft message

- **Priority:** P1 · **Release:** R6 (v1.5.0) · **Status:** In progress
- **PRD:** [AI features → Summarise conversation (P03), Draft message (P04)](../PRD.md#ai-features)

## What it does

Two more tools in the person page's AI panel (owner or Admin).

- **Summarise conversation (P03):** paste a whole LinkedIn thread. The AI returns a short
  summary, the prospect's needs and objections, and a suggested stage and next action with
  date. **Confirm** applies the suggestion (as in F09); **Save as note** adds the summary to the
  timeline as a note. Nothing is saved until the rep clicks one of these.
- **Draft message (P04):** pick a template (active templates). The AI fills the placeholders and
  personalises it from the person's record, persona angle and timeline. The draft is editable,
  with Copy. **Mark as sent** logs a "Message sent" activity with the template and its A/B/C
  version, AI suggestion used = yes and the edit level. If the template is a Message 1 or a
  follow-up, use the matching quick-log button instead to move the sequence; Mark as sent here
  only logs the message.

## Rules

- Same guardrails, Product Facts requirement, 30-second limit and permissions as F09.
- The AI may suggest stages Request sent through Trial/Pilot (never Lost or Paid).

## Tests

- Automated: summary result shape; Save as note; draft logged with template and version and
  edit level; placeholders refused if left in the draft.
- Browser (R6): summarise and draft with the stand-in AI.

## Change history

| Date       | Version    | Change                                                                                                   |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | Unreleased | Placeholder doc created.                                                                                 |
| 2026-10-17 | Unreleased | Full doc written (R6).                                                                                   |
| 2026-10-17 | Unreleased | Summarise (Save as note, Confirm) and Draft (Mark as sent with template version) built; R6 browser test. |
