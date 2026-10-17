# F09: Reply Assistant

- **Priority:** P1 · **Release:** R6 (v1.5.0) · **Status:** In progress
- **PRD:** [AI features → Reply Assistant (P02); Guardrails; Edit level](../PRD.md#ai-features)

## What it does

On the person page (owner or Admin), the rep pastes the prospect's message and clicks
**Suggest replies**.

1. The text is saved straight away as a "Reply received" activity (stage → Replied, sequence
   Stopped, next action Respond today), even if the AI then fails.
2. P02 gets the reply, the full timeline, the person (persona, level, company, stage, sequence
   step), the team's reply templates and Product Facts.
3. The panel shows:
   - the **reply type** the AI chose, which the rep can change (saved on the activity; it drives
     the Dashboard's "Interested" count)
   - **2–3 suggested replies**, each with its approach label, editable, with Copy
   - a **suggested stage and next action with date**, with Confirm
   - **flags** for anything Product Facts doesn't answer
4. **Mark as sent** logs a "Message sent" activity with the final text, the approach, AI
   suggestion used = yes and the **edit level**.

## Rules

- **Edit level** compares the sent text with the suggestion: None if unchanged; Light if up to
  20% of characters changed (edit distance ÷ longer length); Heavy if more.
- **Confirm** sets the stage, next action and date, logs a "Stage change" activity if the stage
  changed, and is audited. The AI may suggest only Replied, Demo booked, Demo done or
  Trial/Pilot.
- AI needs Product Facts ("What Lumor does" and "Live features"); without them the panel says
  so. Without `ANTHROPIC_API_KEY` it says "AI isn't set up yet".
- 30-second limit with **Try again**. Users can't use it on someone else's lead.

## Tests

- Automated: reply saved before the AI call; reply type change audited; edit level None/Light/
  Heavy at the 20% edge; Mark as sent fields; Confirm; refusal on someone else's lead; no key →
  clear message.
- Browser (R6 exit check): a pasted reply returns a reply type, 2–3 suggestions and a stage
  suggestion (stand-in AI); Mark as sent logs it.

## Change history

| Date       | Version    | Change                   |
| ---------- | ---------- | ------------------------ |
| 2026-10-16 | Unreleased | Placeholder doc created. |
| 2026-10-17 | Unreleased | Full doc written (R6).   |
