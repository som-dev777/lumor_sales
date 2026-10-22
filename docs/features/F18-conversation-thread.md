# F18: Conversation thread and AI reply guidance

- **Priority:** P0 · **Release:** R8 (v2.2.0) · **Status:** In progress
- **PRD:** [Version 2 scope → F18](../PRD.md#version-2-scope-r7r9)
- **Decisions:** D-038 (owner's choices on 2026-10-22, and mine)
- **Changes:** F09 Reply Assistant becomes **Suggest next message**; F10 Summarise and Draft read
  the thread; F08 Today gets nudge tasks and the Admins' **Team** tab.

## What it does

A chat-style **Conversation** replaces the Timeline on each person's page. Every message says
**who** sent it (the rep or the prospect), **where** (LinkedIn, InMail, Email, WhatsApp, Call or
In person) and **when** (date and time, IST). The AI reads this thread, so it knows what the rep
said, what the prospect said and in what order, even when the prospect hasn't replied yet.

## The thread

- **Order:** oldest first, newest at the bottom, like a chat.
- **From me** (right): messages sent, calls made, and what the rep said in a meeting. Shows who
  logged it ("You" or the rep's name).
- **From them** (left): replies, with the reply type when set.
- **Notes** (centre): meeting minutes, WhatsApp summaries, AI summaries, anyone's notes. A note
  can carry its channel too.
- **Plan and stage events** (connection requests, acceptances, plan changes, stage changes,
  meetings booked or held, tasks done) are hidden behind **Show plan and stage events**.
- Old activities appear in the thread automatically: messages sent and calls on the rep's
  side, replies on the prospect's side, notes in the centre. Nothing is lost.

## Adding messages

Owner or Admin only (anyone can still add a note).

**One at a time** (the box under the thread):

| Field             | Rule                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| From              | **From me** / **From {first name}** / **Note**                                             |
| Channel           | LinkedIn, InMail, Email, WhatsApp, Call, In person                                         |
| When              | Date and time in IST; starts at now; can be earlier, never later than now                  |
| Text              | Required, up to 5,000 characters                                                           |
| Reply type        | From them only, optional                                                                   |
| Expect a reply by | From me only, optional; between the Playbook Settings bounds (1–10 days after the message) |

**Paste a whole conversation:** the rep pastes a copied LinkedIn (or email) thread and picks
the channel. The AI (P05) splits it into messages, marks who sent each one and reads the dates
and times. The rep reviews every row (From, When, Channel, Text), can fix or remove any, and
clicks **Save messages**. Rows that match a message already in the thread (same side, same
text) start unticked as "Already in the conversation". A row with no readable time must be
given one before saving. Nothing is saved until the rep clicks Save.

## What each message does to the plan and Today

| Entry                                      | Logged as                  | Effect                                                                                                                                                                                                     |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| From them (any channel)                    | Reply received             | Stage → Replied (forward only); next action Respond. The active plan **pauses** at the reply's time. The reply-by date and the nudge count are cleared. Shows under Replies waiting until the rep answers. |
| From me: LinkedIn, InMail, Email, WhatsApp | Message sent / InMail sent | An outreach touch at its real date. Stage → Contacted (forward only).                                                                                                                                      |
| From me: Call                              | Call (outcome Connected)   | A connected call at its real date.                                                                                                                                                                         |
| From me: In person                         | Meeting note (from me)     | Part of the conversation; not a plan touch.                                                                                                                                                                |
| Note                                       | Meeting note               | No change.                                                                                                                                                                                                 |

- **Is this step N of their plan?** When a single "From me" entry matches the channel of the
  person's current plan step, the app asks, as quick-log does. **Yes** does the step at the
  entry's date and time; **No** logs an extra touch.
- **Earlier dates re-plan quietly** (owner): the next step is scheduled from the entry's real
  date, and a reply dated in the past pauses the plan from that time. No warning is shown.
- **Guardrails:** Do not contact refuses every "From me" entry. A "From me" entry dated today
  gets the usual guardrail warnings ("Log anyway?"); an earlier one is history and is logged
  without warnings.
- **Pasted conversations** are history: outbound rows are extra touches (no step question, no
  warnings); a reply in them pauses the plan.

## Suggest next message (P02 v2.0, replaces Reply Assistant)

One button. It reads the whole thread and works out the situation first:

| Situation (worked out by the app)                                                                      | What the AI gives                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reply to them:** the last message is theirs                                                          | Reply type (saved on the reply if it had none; the rep can change it), 2–3 replies with approach labels, a reply-by date with a one-line reason (or none for "Not now"), a suggested stage and next action, flags |
| **Wait:** the last message is the rep's and the reply-by date (or the plan's next step) is still ahead | Advice to wait, with the date; an optional message only if something new is worth adding                                                                                                                          |
| **Nudge:** the reply-by date has passed, fewer than 2 nudges sent                                      | 1–2 nudges that add something new, a new reply-by date                                                                                                                                                            |
| **Close the loop:** 2 nudges sent with no reply                                                        | A polite close-the-loop message; no new date                                                                                                                                                                      |
| **Start:** nothing sent yet                                                                            | An opener based on the persona's angle                                                                                                                                                                            |

- **Mark as sent** on a suggestion logs it with its channel and saves the confirmed **Expect a
  reply by** date on the person (the AI never sets it alone). A nudge adds 1 to the nudge
  count; a reply to them resets it; close the loop clears the date.
- The reply-by date must be 1–10 days after today (Playbook Settings bounds). The deadline
  guidance in the PRD (2 business days when interested, +2 days for CXO/VP, none for "Not
  now"…) is given to the AI.

## Summarise conversation (P03 v1.3) and Draft message (P04 v1.3)

- **Summarise** reads the saved thread: one click, no pasting. Save as note and Confirm stay.
- **Draft** also reads the thread, so it doesn't repeat what was already said.

## Today (F08)

- **Expired reply deadlines:** when the confirmed reply-by date passes with no reply, the
  person shows here as a **nudge** task ("Expected a reply by 24 Oct · nudge 1 of 2"). **Draft
  nudge** asks the AI for a draft in place, with Copy and Mark as sent (which sets the next
  reply-by date). After 2 nudges the task says to close the loop instead.
- **Team tab (Admins):** per rep: tasks due today, overdue tasks, done today (outreach steps and
  calls, messages, withdrawals and meetings held, logged today), people in active plans, and
  replies waiting more than 1 day.

## Permissions

- Adding "From me"/"From them" entries, pasting a conversation and the AI tools: the lead's
  owner or an Admin (`lead.edit`). Notes: anyone (`lead.addNote`).
- Team tab: Admins (`today.team`).
- Every entry writes an audit entry in the same transaction.

## Data

- `activity.direction`: `out` (from the rep), `in` (from the prospect) or empty (notes and
  events). Existing rows are filled in by the migration.
- `person.nudge_count`: nudges sent since the last reply. `person.awaiting_reply_until` (from R7)
  holds the confirmed reply-by date.

## Tests

- Automated: each entry type's effect (reply pauses the plan at its time, clears the deadline;
  messages and calls are touches; in-person and notes aren't); no future times; Do not
  contact; earlier dates re-plan from the real date; "Yes, step N" at the entry's time; the
  paste preview (split, duplicates, missing times); the situation rules (reply, wait, nudge,
  close, start); deadline bounds; nudge count; Today's nudge task; the Team tab numbers and
  that only Admins see it.
- Browser (R8 exit check): add a message from me and a reply from them; paste a conversation
  and save it; Suggest next message, accept a suggestion with a 2-day reply-by date, move the
  test date past it and see the nudge task on Today; an Admin sees the Team tab.

## Change history

| Date       | Version | Change                                                                                                                                                      |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | 2.1.0   | Placeholder doc created.                                                                                                                                    |
| 2026-10-22 | 2.2.0   | Full doc written (R8) with the owner's choices, before code.                                                                                                |
| 2026-10-22 | 2.2.0   | Built: conversation thread, one-at-a-time and pasted messages (P05), Suggest next message (P02 v2.0), reply-by dates and nudges, Team tab; R8 browser test. |
