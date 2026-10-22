# F10: Conversation summary and draft message

- **Priority:** P1 · **Release:** R6 (v1.5.0) · **Status:** Done (v1.5.0)
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

- From R8 (F18), Summarise reads the saved conversation (one click, no pasting) and Draft reads
  it too, so it doesn't repeat what was said.
- Same guardrails, knowledge-file requirement (F20), 30-second limit and permissions as F09.
- The AI may suggest stages Request sent through Trial/Pilot (never Lost or Paid).

## Tests

- Automated: summary result shape; Save as note; draft logged with template and version and
  edit level; placeholders refused if left in the draft.
- Browser (R6): summarise and draft with the stand-in AI.

## Change history

| Date       | Version | Change                                                                                                                                                                                     |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-16 | 1.5.0   | Placeholder doc created.                                                                                                                                                                   |
| 2026-10-17 | 1.5.0   | Full doc written (R6).                                                                                                                                                                     |
| 2026-10-17 | 1.5.0   | Summarise (Save as note, Confirm) and Draft (Mark as sent with template version) built; R6 browser test.                                                                                   |
| 2026-10-17 | 1.5.0   | Released in v1.5.0 (R6 AI).                                                                                                                                                                |
| 2026-10-18 | 2.1.0   | The AI now runs on OpenAI (default model gpt-5.5, D-036); same prompt and screens.                                                                                                         |
| 2026-10-22 | 2.1.0   | Summarise and Draft read the AI knowledge files (F20, D-037). P04 v1.2 leaves an unknown placeholder visible and tells the rep in the notes; Mark as sent stays refused until it's filled. |
| 2026-10-22 | 2.1.0   | Released in v2.1.0 (AI Resources).                                                                                                                                                         |
| 2026-10-22 | 2.2.0   | Summarise (P03 v1.3) and Draft (P04 v1.3) read the conversation thread (F18); no pasting.                                                                                                  |
