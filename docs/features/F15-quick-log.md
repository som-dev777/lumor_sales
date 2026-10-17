# F15: Quick-log actions

- **Priority:** P0 · **Release:** R4 (v1.3.0), revised in R7 (v2.0.0) · **Status:** In progress (v2)
- **PRD:** [Business rules → Quick-log automation](../PRD.md#business-rules)

## What it does

One-click buttons on the person page to log what just happened. Each click logs the activity
with the time and moves the lead's stage and next action. From v2, follow-up timing comes from
**plans** (F17). The fixed sequence and its delays are gone (D-032).

## Buttons (v2)

| Button                                                              | Activity logged            | Stage (forward only)     | Next action                                  |
| ------------------------------------------------------------------- | -------------------------- | ------------------------ | -------------------------------------------- |
| Request sent (with or without a note)                               | Request sent               | → Contacted              | Check acceptance, today + withdraw days (14) |
| Accepted                                                            | Request accepted           | → Connected              | Send Message 1, today + 1 (guardrail 1)      |
| Message sent (LinkedIn, InMail, Email, WhatsApp; template optional) | Message sent / InMail sent | → Contacted              | cleared                                      |
| Call (outcome required)                                             | Call, with the outcome     | → Contacted if Connected | unchanged                                    |
| Got a reply (reply type required)                                   | Reply received             | → Replied                | Respond, today. **Pauses the person's plan** |
| Meeting booked (date required)                                      | Meeting booked             | Meeting scheduled        | Hold meeting, on the date                    |
| Meeting held                                                        | Meeting held               | Meeting done             | Send recap, today                            |
| Proposal sent                                                       | Stage change               | Proposal sent            | Follow up on proposal, today + 3             |
| Mark converted                                                      | Deal update                | Paid                     | none; converted = yes                        |
| Mark lost (reason required)                                         | Stage change               | Lost                     | none                                         |

- "Forward only": outreach never moves a lead backwards, and Lost, Paid and Active customer
  stay as they are.
- **Do not contact** blocks Request sent, Message sent and Call on the server.
- **On a plan:** if the button matches the current step's channel, the app asks "Is this step
  N of their plan?" **Yes** does the step (F17); **No** logs an extra touch.
- **Guardrails:** outreach touches are checked first (F17). A block refuses the touch. A
  warning asks "Log anyway?", and the override is recorded in the audit entry.
- Users can't log outreach on a lead someone else owns. Every log writes the activity and a
  "Person Updated" audit entry in one transaction.

## Screen

Person page: a "Log what happened" bar. Buttons that need more information open a small
dialog. After Mark converted, the page offers Mark as customer for the company.

## Tests

- Automated: every row of the table (activity, stage, step, next action, date) using the
  settings delays; follow-up progression and Nurture; Message 1 date counting; reply type,
  demo date and lost reason required; claimed-lead refusal; converted fields; audit.
- Browser (R4 exit check): one lead walked from Request sent to Paid moves through every
  stage, and the dashboard counts it.

## Change history

| Date       | Version    | Change                                                                                                                                              |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | 1.3.0      | Placeholder doc created.                                                                                                                            |
| 2026-10-17 | 1.3.0      | Full doc written (R4).                                                                                                                              |
| 2026-10-17 | 1.3.0      | Quick-log rules built and tested on the server.                                                                                                     |
| 2026-10-17 | 1.3.0      | "Log what happened" bar and dialogs on the person page; Mark-as-customer prompt after converting.                                                   |
| 2026-10-17 | 1.3.0      | Released in v1.3.0 (R4 Daily work).                                                                                                                 |
| 2026-10-18 | Unreleased | v2 (R7): v2 stages and channels, Call and Proposal sent buttons, Do not contact; the fixed sequence is replaced by plans.                           |
| 2026-10-18 | Unreleased | Quick-log goes through the cadence guardrails ("Log anyway?" is audited) and asks "Is this step N of their plan?" when it matches the current step. |
