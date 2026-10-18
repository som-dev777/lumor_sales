# F08: Today planner

- **Priority:** P1 · **Release:** R6 (v1.5.0), revised in R7 (v2.0.0) · **Status:** Done (v2.0.0)
- **PRD:** [Version 2 scope → F08 Today (revised)](../PRD.md#version-2-scope-r7r9), [AI features → Today planner (P01)](../PRD.md#ai-features)

## What it does

The home page (`/`). From v2 it's driven by plans (F17) and deadlines: it lists exactly what
the signed-in rep should do today, with the message or call script for each task. It also
shows today's connection-request target and, after **Rank with AI** (P01), a reason for each
task and a two-sentence summary of the week.

## Sections (the rep's own leads; Do not contact and snoozed leads left out; IST dates)

1. **Replies waiting:** the lead's latest activity is a reply. Always on top.
2. **Meetings today:** next action "Hold meeting" due today or earlier.
3. **Expired reply deadlines:** "awaiting reply until" has passed. Built in R7; the dates are
   set from R8 (F18).
4. **Plan steps due today:** the current step of an active plan, due today. This includes
   **Withdraw invite** tasks (14 days with no acceptance).
5. **Overdue steps:** due before today.
6. **Trial check-ins:** steps due from Trial plans.
7. **Plans finished with no reply:** after the last step, or once the plan's time limit has
   passed. **Nurture** (60 days, no touches) or **Lost** ("No response").
8. **Nurture checks:** Nurture has ended. **Enrol in a plan** or **Lost**.
9. **Stale leads:** people not on any plan with no activity for the stale-lead threshold
   (D-033 F7).

A lead appears once, in the first section that matches.

## Tasks

- **Step tasks** show the message with placeholders filled in from the person, editable, or
  the call script. **Done** logs the touch to the timeline with the exact text, the channel,
  the plan and the step, then schedules the next step (F17). It's refused while any `{…}` is
  unfilled.
  - Email opens in the rep's mail app first.
  - Calls show outcome buttons.
  - Steps go through the cadence guardrails: blocks refuse; warnings ask "Log anyway?".
- **Snooze:**
  - **Plan step:** moves to tomorrow (a weekday, within the guardrails).
  - **Other task:** hides the lead until tomorrow (`snoozed_until`).
- **Replies waiting → Mark replied**, **Meetings → Meeting held**, **Withdraw invite →
  Withdrawn**, **Finished/Nurture check → Nurture, Lost or Enrol**.
- The **target bar** ("12 of 20 requests sent") stays. Admins' **Team** tab comes in R8.

## AI ranking (P01)

Unchanged from v1 apart from the section names (P01 v1.1). It runs only when **Rank with AI**
is clicked. If AI isn't set up, fails, or takes over 30 seconds, the list stays in rule order.

## Tests

- Automated: each section's rule; one section per lead; a step's Done schedules the next step;
  Snooze within the guardrails; the finished and Nurture choices; Do not contact hidden;
  ranking merges the AI order.
- Browser: the R7 exit check runs through Today (see F17).

## Change history

| Date       | Version    | Change                                                                                                                                                           |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.5.0      | Placeholder doc created.                                                                                                                                         |
| 2026-10-17 | 1.5.0      | Full doc written (R6).                                                                                                                                           |
| 2026-10-17 | 1.5.0      | Today page built: sections, target bar, Done, Snooze (snoozed_until), Rank with AI (P01) with fallback; R6 browser test.                                         |
| 2026-10-17 | 1.5.0      | Released in v1.5.0 (R6 AI).                                                                                                                                      |
| 2026-10-18 | 2.0.0      | Rewritten for v2 (R7): plan-driven sections, step tasks with message or script, Nurture checks.                                                                  |
| 2026-10-18 | 2.0.0      | Plan-driven Today built: v2 sections, step tasks with the message or call script, Done/outcomes, Withdraw, Nurture/Lost, Nurture checks, guardrail-aware Snooze. |
| 2026-10-18 | 2.0.0      | Fix: a reply that pauses a plan now shows under Replies waiting (system events are ignored when finding the latest activity).                                    |
| 2026-10-18 | 2.0.0      | Released in v2.0.0 (R7 Plans).                                                                                                                                   |
| 2026-10-18 | Unreleased | The AI now runs on OpenAI (default model gpt-5.5, D-036); same prompt and screens.                                                                               |
