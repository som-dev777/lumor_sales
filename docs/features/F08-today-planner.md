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
3. **Expired reply deadlines:** the reply-by date the rep confirmed has passed with no reply
   (F18). A **nudge** task: "Expected a reply by 24 Oct · nudge 1 of 2", with **Draft nudge**
   (the AI drafts it in place; Mark as sent asks for the next reply-by date). After 2 nudges it
   says to close the loop politely.
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
- The **target bar** ("12 of 20 requests sent") stays.
- **Team tab (Admins, R8):** **My day** / **Team** at the top of Today. Per active user: tasks due
  today (every section except Overdue and Stale), overdue steps, done today (connection requests,
  messages, calls, tasks, withdrawals and meetings held logged today; D-038), people on active
  plans, and replies waiting more than 1 day.

## AI ranking (P01)

Unchanged from v1 apart from the section names; from v2.1.0 it reads the AI knowledge files
ticked for P01 (P01 v1.2, F20). It runs only when **Rank with AI**
is clicked. If AI isn't set up, fails, or takes over 30 seconds, the list stays in rule order.

## Tests

- Automated: each section's rule; one section per lead; a step's Done schedules the next step;
  Snooze within the guardrails; the finished and Nurture choices; Do not contact hidden;
  ranking merges the AI order.
- Browser: the R7 exit check runs through Today (see F17).

## Backlogs, dated snooze and the Team tab (v2.7.0, D-043)

- **Backlog** is the new first section: anything due on an earlier day and not done. That covers
  a reply not answered, a meeting not marked held, a recap not sent, a nudge, a plan step and a
  withdraw. Each says "due {date} · {n} days late". It replaces "Overdue steps".
  - Due dates: a reply is due the day it came in; a meeting, the meeting date; a recap, the
    day after the meeting; a nudge, the day after the reply-by date; a plan step, its due
    date; a withdraw, 14 days after the request.
  - A snoozed task is due on its snooze date.
- **Snooze** asks for a date: Tomorrow, In 2 days, Next Monday, or pick one (up to 60 days
  ahead). The task comes back that day as due today. A plan step's new date still respects the
  weekly touch limit (it may move a day or two later; the toast says when).
- **People and Companies:**
  - A red **Backlog** badge on a person's row and page.
  - **Backlog only** filter on People.
  - A **Backlog** column on Companies (people with a backlog).
- **Team tab:** per active user, using exactly the rules of their My day:
  - Due today (every section except Backlog and Stale)
  - Backlog
  - Meetings today (calendar)
  - Done today
  - On active plans
  - Replies waiting over 1 day

  Each number is a link that opens the list behind it under the table.

### Tests (v2.7.0)

- Each backlog rule and its due date; a task snoozed to a date returns that day (not as a
  backlog); a snoozed plan step respects the weekly limit; the People and Companies backlog
  matches Today; the Team counters equal each person's My day; the Team details lists.

## Every follow-up shows (v2.7.1, D-044)

- **Follow-ups due:** any next action due today or earlier, whatever it says, until the person is
  converted, Paid, an Active customer, Lost or Do not contact. Overdue ones are in Backlog.
- **Needs a follow-up date:** people in Contacted to Trial with no next-action date and nothing
  else on Today.
- On a plan, the plan's dates rule; when the plan is paused (a reply), the next action shows.
- **Set next follow-up** sets what and when (audited).

## Change history

| Date       | Version | Change                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.5.0   | Placeholder doc created.                                                                                                                                                                                                                                                                                                     |
| 2026-10-17 | 1.5.0   | Full doc written (R6).                                                                                                                                                                                                                                                                                                       |
| 2026-10-17 | 1.5.0   | Today page built: sections, target bar, Done, Snooze (snoozed_until), Rank with AI (P01) with fallback; R6 browser test.                                                                                                                                                                                                     |
| 2026-10-17 | 1.5.0   | Released in v1.5.0 (R6 AI).                                                                                                                                                                                                                                                                                                  |
| 2026-10-18 | 2.0.0   | Rewritten for v2 (R7): plan-driven sections, step tasks with message or script, Nurture checks.                                                                                                                                                                                                                              |
| 2026-10-18 | 2.0.0   | Plan-driven Today built: v2 sections, step tasks with the message or call script, Done/outcomes, Withdraw, Nurture/Lost, Nurture checks, guardrail-aware Snooze.                                                                                                                                                             |
| 2026-10-18 | 2.0.0   | Fix: a reply that pauses a plan now shows under Replies waiting (system events are ignored when finding the latest activity).                                                                                                                                                                                                |
| 2026-10-18 | 2.0.0   | Released in v2.0.0 (R7 Plans).                                                                                                                                                                                                                                                                                               |
| 2026-10-18 | 2.1.0   | The AI now runs on OpenAI (default model gpt-5.5, D-036); same prompt and screens.                                                                                                                                                                                                                                           |
| 2026-10-22 | 2.1.0   | Rank with AI reads the AI knowledge files ticked for P01 (F20, D-037).                                                                                                                                                                                                                                                       |
| 2026-10-22 | 2.1.0   | Released in v2.1.0 (AI Resources).                                                                                                                                                                                                                                                                                           |
| 2026-10-22 | 2.2.0   | R8: nudge tasks with Draft nudge in Expired reply deadlines; the Admins' Team tab (F18, D-038).                                                                                                                                                                                                                              |
| 2026-10-22 | 2.2.0   | Released in v2.2.0 (R8 Conversations).                                                                                                                                                                                                                                                                                       |
| 2026-10-30 | 2.4.0   | New outreach today counts each person the rep added today or sent a connection request to today, once ("x of 20 new people today"; D-040).                                                                                                                                                                                   |
| 2026-10-30 | 2.4.0   | Released in v2.4.0 (QA round 1).                                                                                                                                                                                                                                                                                             |
| 2026-11-02 | 2.5.0   | **Meetings today** from the calendar (F22) at the top of Today; released in v2.5.0.                                                                                                                                                                                                                                          |
| 2026-11-03 | 2.7.0   | Backlog section, dated snooze, backlog badges on People and Companies, Team tab counters and details written (D-043), before code.                                                                                                                                                                                           |
| 2026-11-03 | 2.7.0   | Built: Backlog section (one shared rule set for Today, the Team tab and the badges), Snooze to a date (Tomorrow, In 2 days, Next Monday, or any day within 60), backlog badges and filter on People, Backlog column on Companies, Team tab counters (Backlog and Meetings today added) with the list behind each number.     |
| 2026-11-03 | 2.7.0   | Released in v2.7.0 (D-043).                                                                                                                                                                                                                                                                                                  |
| 2026-11-03 | 2.7.1   | Follow-ups due and Needs a follow-up date sections; Set next follow-up (D-044).                                                                                                                                                                                                                                              |
| 2026-11-03 | 2.7.2   | Your meetings: today and the next 7 days, with Join and Details (D-045).                                                                                                                                                                                                                                                     |
| 2026-11-04 | 2.8.0   | Today's meetings only (the next 7 days moved to the Calendar); the page refreshes itself every minute and when you come back to it; **Remove** (with a confirmation) on follow-ups, backlogs, "no date", reply deadlines and "no activity" (D-054).                                                                          |
| 2026-11-04 | 2.9.0   | Anything logged on or after a follow-up's date (on Today or the person's page) clears it and its backlog (`person.next_action_set_at`); a nudge clears once followed up; worked on today means no "set a date" until tomorrow; meetings leave once they end; the page fetches itself again when you come back to it (D-055). |
| 2026-11-04 | 2.11.0  | Previous day / Next day, 7 days back and 7 ahead; new outreach counts a first message too (same rule as Reports) (D-057): written before code.                                                                                                                                                                               |
| 2026-11-04 | 2.11.0  | Built and released: Previous day / Next day (D-057).                                                                                                                                                                                                                                                                         |
| 2026-11-05 | 2.13.0  | Renamed My tasks; What you logged today/that day with each person's follow-up date, changeable; Set next follow-up defaults to tomorrow (D-059): written before code.                                                                                                                                                        |
| 2026-11-05 | 2.13.0  | Built and released: My tasks, follow-ups beside logs (D-059).                                                                                                                                                                                                                                                                |
