# F19: Reports

- **Priority:** P1 · **Release:** R9 (v2.3.0) · **Status:** Done
- **PRD:** [Version 2 scope → F19](../PRD.md#version-2-scope-r7r9)
- **Decisions:** D-039 (owner's choices on 2026-10-30, and mine)

## What it does

A new **Reports** page in the sidebar (after Dashboard). Anyone can make a report on their own
work; Admins can make one for the whole team or any one person. Every report is saved, can be
opened again from **Report history**, printed or saved as PDF, and downloaded as CSV. Admins
also set up **scheduled reports** that are made automatically and emailed with a link to the
saved copy.

## Making a report

| Choice | Options                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who    | **Me** (everyone); **Whole team** or **one person** (Admins)                                                                                                                                   |
| Period | Today, This week (Mon–Sun), This month, This quarter, This half-year, This year, or **Custom** From–To. All in IST. Quarters and half-years follow the calendar (Jan–Mar…, Jan–Jun / Jul–Dec). |

**Generate** builds the report from the data at that moment and saves it (a snapshot: later
changes don't alter a saved report).

## What a report contains

1. **Activity per person:** connection requests, messages (LinkedIn, InMail, WhatsApp), emails,
   calls (all, and connected).
2. **Replies and outcomes per person:** replies received, meetings booked and held, proposals
   sent, trials, conversions, and deal value (₹, the converted people's companies).
3. **Plan adherence per person:** plan steps done, how many on time and how many late (done
   after their due date). Steps done before R9 have no due date recorded and show as "not
   recorded".
4. **Plan performance:** reply rate per plan and per step (the Dashboard's table, for the
   period and the people in the report).
5. **The funnel:** the Dashboard's funnel for the period and people (events in the period,
   D-020), with conversions against benchmarks.
6. **AI summary (optional, P06):** 2–3 sentences on what stands out, written from the report's
   numbers only. **Write AI summary** on a saved report; scheduled reports include it when AI
   is set up. If the AI fails, the report is still saved and sent without it.

## Exports

- **Download PDF:** the report opens as a clean print layout; the button uses the browser's
  **Save as PDF** (owner: no PDF library, D-039).
- **Download CSV:** one file with every table, each under its own heading row.

## Scheduled reports (Admins)

Each schedule has:

| Field     | Rule                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Name      | Required                                                                                                 |
| Frequency | Daily, Weekly, Monthly, Quarterly, Half-yearly, Yearly                                                   |
| When      | A time (IST, on the hour or half hour). Weekly: a weekday. Monthly and longer: a day of the month (1–28) |
| Scope     | Whole team, one person, or **each rep gets their own**                                                   |
| Send to   | Admins, a list of email addresses, or each rep (for "each rep")                                          |
| On/off    | A switch                                                                                                 |

- **What period it covers:** daily = that day (up to the run time); weekly = the previous Mon–Sun;
  monthly = the previous month; quarterly, half-yearly and yearly = the previous one.
- **Defaults** (added by `npm run seed:reports`, never changed once there):

  | Name                   | When             | Scope      | Sent to  |
  | ---------------------- | ---------------- | ---------- | -------- |
  | Daily team report      | Every day, 19:00 | Whole team | Admins   |
  | Weekly team report     | Monday, 09:00    | Whole team | Admins   |
  | Daily personal summary | Every day, 19:00 | Each rep   | That rep |

- **How they run:** a Netlify scheduled function wakes every 15 minutes and calls the app's
  `/api/cron/reports` with a secret (`CRON_SECRET`); the app runs every schedule that's due and
  sets its next run. Locally, **Run now** on a schedule (Admins) does the same for one schedule.
- **Email:** a short summary (the headline numbers and the AI summary) and a link to the saved
  report. Opening it needs a login. Without the Resend key, reports are still made and saved;
  they just aren't emailed. Each run records who it was emailed to.
- Creating, changing, switching off or deleting a schedule writes an audit entry.

## Who sees what

|                                             | Admin | User                                   |
| ------------------------------------------- | ----- | -------------------------------------- |
| Make a report on themselves                 | Yes   | Yes                                    |
| Make a report on the team or another person | Yes   | No                                     |
| Open a saved report                         | All   | Their own (made by them or about them) |
| Schedules: see, create, change, run now     | Yes   | No                                     |

## Data

- `report_run`: who and period (JSON), the snapshot (JSON), the AI summary, made by (user, or
  empty for a schedule), the schedule it came from, emailed to (JSON).
- `report_schedule`: the fields above, plus next run and last run.
- `activity.plan_due_date`: the date a plan step was due, saved when it's done (for plan
  adherence).

## Tests

- Automated: each period's dates (IST, quarters, half-years, custom range); the numbers in each
  section against hand-built data; reps can only report on themselves and open their own;
  on-time vs late steps; CSV contents; schedules' next run for each frequency (IST, weekends,
  month ends); due schedules run once, are saved, emailed to the right people (stubbed), and
  skipped when switched off; the cron route refuses a wrong secret; audit entries.
- Browser (R9 exit check): generate a team report and a personal report for a custom range,
  open the print view and download the CSV; an Admin creates a schedule, clicks **Run now** and
  sees it in Report history. (The browser tests run without an email key, so emailing is checked
  by the automated tests with a stand-in sender.)

## Round 2 (v2.7.0, D-043)

- **Email to:** Make a report has **Email to**: tick teammates and/or type other addresses (up
  to 20). Generate saves the report and emails it to all of them, with the PDF attached and a
  link. A saved report has **Email this report** to send it again. Each send is recorded.
- **Shared with me:** teammates a report is sent to get a notification (F25) and can open it.
  Report history has three tabs: **Made by me**, **Shared with me** and, for Admins, **All
  reports**. Scheduled reports share with the Admins or reps they're sent to.
- **Pipeline** (a new first section), per rep and in total, for the period:
  - People added
  - Companies added
  - New outreach (people contacted for the first time)
  - Replied (people who replied)
  - Converted
  - No response yet (contacted in the period, no reply so far)
  - Where their people stand now, by stage
- **PDF with charts:** the app makes the PDF itself (jsPDF), with the headline numbers, every
  table and three charts: outreach and replies per rep, the funnel, and people by stage.
  **Download PDF** downloads the file. The print view stays for printing.

### Who sees what (round 2)

- Open a saved report: Admins all; others the ones they made, the ones about them, and the ones
  sent to them.
- Anyone can email their own report to anyone.

### Tests (round 2)

- The Pipeline numbers against hand-built data; Email to sends to teammates and addresses and
  shares with the teammates (notification); Shared with me lists them; others can't open it; the
  PDF is a valid PDF with the report's title; scheduled reports share with their recipients.

## Change history

| Date       | Version | Change                                                                                                                                                                                                                                             |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | 2.1.0   | Placeholder doc created.                                                                                                                                                                                                                           |
| 2026-10-30 | 2.3.0   | Full doc written (R9) with the owner's choices, before code.                                                                                                                                                                                       |
| 2026-10-30 | 2.3.0   | Built: Reports page, saved snapshots, print-to-PDF, CSV, AI summary (P06), scheduled reports with the cron route and Netlify function, 3 default schedules; plan steps keep their due date; R9 browser test.                                       |
| 2026-10-30 | 2.3.0   | Released in v2.3.0 (R9 Reports).                                                                                                                                                                                                                   |
| 2026-11-03 | 2.7.0   | Round 2 written (D-043), before code: Email to, Shared with me, Pipeline section, PDF with charts.                                                                                                                                                 |
| 2026-11-03 | 2.7.0   | Round 2 built: Email to (teammates and addresses, PDF attached), Email this report, Shared with me and All tabs, Pipeline section with charts, PDF made by the app (jsPDF 4.2.1) with three charts; scheduled reports share with their recipients. |
| 2026-11-03 | 2.7.0   | Released in v2.7.0 (D-043).                                                                                                                                                                                                                        |
