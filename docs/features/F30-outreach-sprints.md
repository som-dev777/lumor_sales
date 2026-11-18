# F30: Outreach sprints (LinkedIn without the ban risk)

- **Priority:** P1 · **Release:** v2.16.0, v2.17.0 (LinkedIn emails) · **Status:** Done (2.17.0)
- **Decisions:** D-065 (assisted sending, never a bot), D-066 (LinkedIn emails from Gmail), D-056
  (Outreach Desk drafts), D-060/D-061 (plan follow-ups), D-042 (Google connection)

## Why

Reps send personalised connection requests and follow-ups on LinkedIn (with Sales Navigator). Bots
that click for the rep (Expandi, HeyReach, Waalaxy…) break LinkedIn's User Agreement and get
accounts restricted. Sales Hub does everything except the click: it picks who's next, writes the
note or message, opens the profile and copies the text. The rep pastes and clicks Send on LinkedIn,
then **Sent ✓** in Sales Hub. Aim: about 20 personalised requests plus the day's follow-ups in about
30 minutes. The server never opens LinkedIn pages.

## Rules

### Add many (People)

- **People → Add many:** paste up to 50 lines, one person per line:
  `profile link, full name, title, company` (commas, tabs or `|`; only the link is needed when a
  default company is chosen). Or pick a CSV file with a header row (link/profile/url, name, title,
  company); it fills the same box.
- **Default company, persona and account filter** for lines that don't name them.
- **Links:** the public profile (`linkedin.com/in/…`). Every person needs a profile or an email
  (D-043), so a Sales Navigator lead link alone is refused with how to get the public link (in Sales
  Navigator: ⋯ → Copy LinkedIn.com URL). No name: one is made from the profile link
  ("priya-sharma-1a2b" → "Priya Sharma").
- **Each line is added exactly like Add person** (same duplicate check on the profile, company
  matching or creation, one audit entry each). Lines that can't be added are listed with why
  (already added by X, no company, not a LinkedIn link). Stage Prospect, owner = whoever adds them.

### Connection sprint (My tasks → Start connection sprint)

- **Who:** your people not contacted yet (no connection request, message, InMail or call ever), not
  Do not contact, not Lost, not in Nurture, and either on no plan or on a plan whose current step
  is a connection request. Optional filters: persona and account filter. Order: persona tier 1
  first, then 2, 3, no persona; oldest added first.
- **How many:** today's target left (Playbook Settings' daily connection target minus the requests
  you sent today), never more than the **weekly limit**: 5 × the daily target (100 by default)
  for Monday to Sunday. Sent ✓ is refused on the server once the weekly limit is reached.
- **Notes are prepared ahead:** while you work on one card, the next ones are drafted by the
  Outreach Desk (P11, LinkedIn connection note), so there's no wait. An unsent note drafted
  earlier is reused.
- **One card per person:** name, title, company, persona, "Who they are", the note (editable, with
  a character count; **300 at most**, LinkedIn's limit), and:
  - **Open profile** (Sales Navigator link when there is one, else the LinkedIn profile) in a new
    tab;
  - **Copy note**;
  - **Sent ✓:** refused while a `{placeholder}` is left or the note is over 300 characters. Logs
    a Request sent with the note's text (through the plan: someone on no plan is put on the
    Official Outreach plan first, so the request is its step 1 and the plan waits for
    acceptance; the follow-up becomes "check acceptance" per D-061). Moves to the next card;
  - **Skip** (back of the list for this sprint) and **Not a fit** (marked Lost: Wrong person).
  - Keys: **O** open, **C** copy, **S** sent, **K** skip.
- A bar shows "3 of 20 sent today · 43 of 100 this week".

### Follow-up sprint (My tasks → Start follow-up sprint)

- **Acceptances first:** your people waiting for a connection request to be accepted. **Accepted**
  logs it (the plan's next step date moves, D-060); **Not yet** leaves it. Requests over the
  withdraw time still show as a Withdraw task on My tasks.
- **Then the messages due:** people whose plan's current step is a LinkedIn message or InMail, due
  today or overdue, and people whose last reply was Interested or Asking for details and haven't
  been answered (**Book the demo**: the draft includes your booking link).
- Each card has a draft of the right kind (first message, next message or reply), editable, with
  **Open conversation** (the profile), **Copy**, **Sent ✓** (refused while a `{placeholder}` is
  left; does the plan step, so the next step's date reaches the person, People and My tasks; a
  reply is logged as your response) and **Skip**.

### LinkedIn emails from Gmail (D-066, v2.17.0)

- **Connect Gmail** (follow-up sprint panel "LinkedIn emails", or Calendar → Availability): the
  Google sign-in also asks to read email (`gmail.readonly`). Only the rep's own Gmail, only
  emails from linkedin.com about invitations and messages are read; nothing is sent or changed in
  Gmail. Disconnect Google (Availability) removes it.
- **When:** every 15 minutes (the scheduled job) and on **Check now**. The first time it reads the
  last 7 days; then from the newest email it read (a day's overlap, never twice). Up to 30 emails
  a run.
- **Which person:** the profile link in the email (`linkedin.com/in/…`) matched with the person's
  profile link; else the sender's full name when exactly one of your own people has it. Only your
  own people are changed.
- **"X accepted your invitation":** logs **Request accepted** at the email's time, through the
  plan (the next step's date moves, D-060). Not logged again if the last request event is already
  an acceptance.
- **"New message from X" / "X sent you a message" / InMail replies:** logs **Reply received**
  (LinkedIn) with the message text from the email, through the conversation, so the follow-up
  becomes Respond today and the plan reacts to the reply. Skipped when the same words are already
  in the thread. LinkedIn's email can shorten a long message; the full message is on LinkedIn.
  No reply type is set: the rep sets it on the person's page if they like.
- **Digests and everything else** (job alerts, "N new messages", posts) are skipped.
- **The panel** shows whether Gmail is connected, **Check now**, and the last 10 emails read with
  what happened: Logged acceptance, Logged reply, Already logged, Not matched (with the name, to
  add them), Skipped.
- **Follow-up sprint:** unanswered replies with no reply type show as **Answer the reply** (a reply
  draft), besides Interested / Asking for details as **Book the demo**.

## Screens

- My tasks: **Start connection sprint** and **Start follow-up sprint** above the list.
- `/sprint` (connection) and `/sprint?kind=follow` (follow-ups): filters, the progress bar, one
  card at a time.
- People: **Add many** next to Add person.
- Follow-up sprint: the **LinkedIn emails** panel (Connect Gmail, Check now, last 10 emails).

## Tests

- Vitest (`src/server/sprint.test.ts`): bulk add (duplicates skipped, companies matched, names from
  links, audit entries); sprint order (tier 1 first) and limits (daily target, weekly limit);
  Sent logs Request sent with the note and puts them on the plan waiting for acceptance; over 300
  characters and placeholders refused; follow-up sprint finds due message steps and Interested
  replies; Accepted moves the plan.
- Vitest (`src/server/google/linkedin-mail.test.ts`, Gmail faked): parsing acceptance, message,
  InMail and digest emails; matching by profile link and by unique name; acceptance logged
  through the plan once; reply logged with its text once; emails never read twice; other reps'
  people untouched; no Gmail permission = nothing read.
- Browser (`e2e/v216-sprint.spec.ts`): paste 3 profiles; start the sprint; Sent on each card; the
  person shows the plan waiting for acceptance.

## Change history

| Date       | Version | Change                                                                                                          |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-11-18 | 2.16.0  | Feature doc written (D-065).                                                                                    |
| 2026-11-18 | 2.16.0  | Built and released: Add many, connection and follow-up sprints.                                                 |
| 2026-11-18 | 2.17.0  | LinkedIn emails from Gmail (doc before code, D-066).                                                            |
| 2026-11-18 | 2.17.0  | Built and released: Connect Gmail, the 15-minute check, Check now, the LinkedIn emails panel, Answer the reply. |
