# F15: Quick-log actions and sequence automation

- **Priority:** P0 · **Release:** R4 (v1.3.0) · **Status:** In progress
- **PRD:** [Business rules → Quick-log automation](../PRD.md#business-rules)

## What it does

One-click buttons on the person page to log what just happened on LinkedIn. Each click logs
the activity with the time, and moves the lead's stage, sequence step and next action
automatically, so nobody has to remember follow-up dates.

## Rules (from the PRD table)

Delays come from Playbook Settings (defaults: follow-ups at 4, 7 and 10 days after Message 1;
withdraw after 14). Follow-up dates are counted from the Message 1 date (D-020). "Today" means
today in IST.

| Button           | Activity logged                      | Stage        | Sequence step     | Next action and date                                         |
| ---------------- | ------------------------------------ | ------------ | ----------------- | ------------------------------------------------------------ |
| Request sent     | Request sent                         | Request sent | Request sent      | Check acceptance, today + 14                                 |
| Accepted         | Request accepted                     | Connected    | Message 1         | Send Message 1, today                                        |
| Message 1 sent   | Message sent (template optional)     | Messaged     | Message 1         | Send Follow-up 1, Message 1 date + 4                         |
| Follow-up 1 sent | Message sent                         | Messaged     | Follow-up 1       | Send Follow-up 2, Message 1 date + 7                         |
| Follow-up 2 sent | Message sent                         | Messaged     | Follow-up 2       | Send Break-up, Message 1 date + 10                           |
| Break-up sent    | Message sent                         | Messaged     | Nurture           | Nurture, no date                                             |
| Got a reply      | Reply received (reply type required) | Replied      | Stopped (replied) | Respond, today                                               |
| Demo booked      | Demo booked (demo date required)     | Demo booked  | Stopped (replied) | Hold demo, on the demo date                                  |
| Demo held        | Demo held                            | Demo done    | unchanged         | Send recap, today                                            |
| Mark converted   | Deal update                          | Paid         | unchanged         | none; converted = yes, today's date; offers Mark as customer |
| Mark lost        | Stage change                         | Lost         | Stopped (replied) | none; lost reason required                                   |

- **"Follow-up sent" is one button whose label follows the sequence:** Follow-up 1 → Follow-up
  2 → Break-up. After Break-up the lead moves to **Nurture** with no date (PRD). It's only
  offered once Message 1 has been sent and the lead isn't in Nurture or Stopped.
- **The Message 1 date** is the date of the lead's first "Message sent" activity.
- Message 1 can record the template used (defaults to the lead's opener template). The
  template's A/B/C version is stored on the activity for template stats.
- An optional note (e.g. the reply text) can be added to any quick-log.
- **Trial/Pilot** is set from the stage dropdown in Edit, not a quick-log button (PRD).
- **Users can't log outreach on a lead someone else owns:** the buttons aren't offered, the
  server refuses, and the page shows "This lead is claimed by {owner}" (notes still allowed).
- Every quick-log writes the activity and a "Person Updated" audit entry (stage, sequence
  step, next action, converted) in one transaction.

## Screen

Person page: a "Log what happened" bar. Buttons that need more information (reply type,
demo date, lost reason, template) open a small dialog. After "Mark converted", if the person
has a company that isn't a customer yet, the app offers Mark as customer straight away.

## Tests

- Automated: every row of the table (activity, stage, step, next action, date) using the
  settings delays; follow-up progression and Nurture; Message 1 date counting; reply type,
  demo date and lost reason required; claimed-lead refusal; converted fields; audit.
- Browser (R4 exit check): one lead walked from Request sent to Paid moves through every
  stage, and the dashboard counts it.

## Change history

| Date       | Version    | Change                                          |
| ---------- | ---------- | ----------------------------------------------- |
| 2026-10-16 | Unreleased | Placeholder doc created.                        |
| 2026-10-17 | Unreleased | Full doc written (R4).                          |
| 2026-10-17 | Unreleased | Quick-log rules built and tested on the server. |
