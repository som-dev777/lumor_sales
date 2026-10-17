# F08: Today planner

- **Priority:** P1 · **Release:** R6 (v1.5.0) · **Status:** In progress
- **PRD:** [Screens → Today](../PRD.md#screens-and-functional-requirements), [AI features → Today planner (P01)](../PRD.md#ai-features)

## What it does

The home page (`/`). Rules build the signed-in rep's task list for today; AI prompt P01 can
then order it and explain each task. It also shows a progress bar for today's connection
requests and, after ranking, a 2-sentence summary of the week.

## Sections (rules, for the rep's own leads; IST dates)

1. **Replies waiting:** the lead's latest activity is "Reply received". Always on top.
2. **Demos today, and recaps:** next action "Hold demo" due today or earlier; or stage Demo
   done with "Send recap" due.
3. **Follow-ups due:** next action Send Message 1 / Follow-up 1 / Follow-up 2 / Break-up due
   today or earlier (dates come from quick-log and Playbook Settings).
4. **Requests to withdraw:** stage Request sent, and the request was sent more than
   "withdraw after" days ago (Playbook Settings, default 14) without being accepted.
5. **New outreach target:** requests left to hit today's target ("12 of 20 requests sent"),
   with a suggested Tier 1 persona and an account filter to work on.
6. **Stale leads:** no activity for "stale-lead" days (default 21) and not Lost or Paid, and not
   already in a section above.

A lead appears in at most one section (the first that matches). Snoozed leads are hidden until
the snooze date.

## Done and Snooze

| Section             | Done logs                                                   |
| ------------------- | ----------------------------------------------------------- |
| Reply waiting       | "Message sent" (Responded); next action cleared             |
| Demo today          | Demo held (the F15 quick-log)                               |
| Recap               | "Message sent" (Post-demo recap); next action cleared       |
| Follow-up due       | Message 1 sent or the next follow-up (the F15 quick-log)    |
| Request to withdraw | "Request withdrawn"; back to Prospect, sequence Not started |
| Stale lead          | no Done; the lead's name links to it                        |

- **Snooze to tomorrow** hides the lead from Today until tomorrow (IST). It's saved on the
  person (`snoozed_until`) and audited.
- Done and Snooze use the same permission as quick-log (the lead's owner or an Admin).

## AI ranking (P01)

- **Rank with AI** sends the task list, the rep's last 7 days of activity counts and the targets.
  It returns the tasks in order of impact with a one-line reason each, and the week summary.
- Ids the AI leaves out are kept, unranked, at the end; ids it invents are ignored.
- Runs only when the button is clicked. If AI isn't set up, fails, or takes more than 30
  seconds, the rule-based list stays and a message offers **Try again**.

## Tests

- Automated: each section's rule; one section per lead; withdraw and stale thresholds from
  Playbook Settings; snooze; Done for each section; ranking merges AI order and keeps
  missing tasks; failures fall back.
- Browser (R6 exit check): Today shows a rep's real list, Rank with AI orders it (stand-in AI),
  Done and Snooze remove a task.

## Change history

| Date       | Version    | Change                   |
| ---------- | ---------- | ------------------------ |
| 2026-10-16 | Unreleased | Placeholder doc created. |
| 2026-10-17 | Unreleased | Full doc written (R6).   |
