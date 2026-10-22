# Manual QA checklist (v2.0.0)

This is for Somnath, to check the whole app by hand before the team uses it. Each step
says what to click and what you should see. Tick the box when it works; if something doesn't,
note the step number and what you saw instead.

The automated tests already cover every rule here (273 checks plus 48 browser walkthroughs).
This list makes sure it also _feels_ right to a person.

**Time needed:** about 1.5 hours for everything. Sections can be done on different days.

---

## 0. Start the app on your Mac

Open Cursor, then **Terminal → New Terminal**, and run these one at a time:

```
npm install
npm run db:migrate
npm run seed:admin
npm run seed:library
npm run seed:plans
npm run seed:knowledge
npm run releases:sync
npm run dev
```

Open http://localhost:3000. Use **two browsers** (for example Chrome and Safari, or Chrome
plus an Incognito window): one for you as Admin, one for a test rep.

- **Admin login:** `somnath@lumor.tech` with the default Admin password (the
  `SEED_ADMIN_PASSWORD` value in your `.env.local`).
- **Test rep:** you'll create one in step 1.3 (any `@lumor.tech` address, e.g. `test.rep@lumor.tech`).

**AI without a key (optional):** to see the AI screens with stand-in answers, stop the app
(Ctrl+C in the Terminal) and start it with `AI_FAKE=1 npm run dev`. The answers are canned, not
real AI. To try the real AI, put your key in `.env.local` as `OPENAI_API_KEY=...` (already done on your Mac) and run
`npm run dev` again.

---

## 1. Logging in and the team (F01)

- [ ] 1.0 `npm run db:migrate` printed "Backup saved: data/backups/…" and the number of people per
      stage before and after. Your old leads now show v2 stages (Request sent → Contacted, Demo
      booked → Meeting scheduled, Demo done → Meeting done, Trial/Pilot → Trial).
- [ ] 1.1 Log in as Admin. You land on **Today**. The left menu shows Today, People, Companies,
      Personas, Account Filters, Templates, Dashboard, Approvals, Audit Log, Settings, About.
- [ ] 1.2 Bottom left shows your name, "Admin", **Change password** and **Log out**.
- [ ] 1.3 In the second browser, open http://localhost:3000/signup and create a test rep with an
      `@lumor.tech` email. You're signed straight in as a **User**.
- [ ] 1.4 Try signing up with a gmail address: it's refused with a clear message.
- [ ] 1.5 As the rep, the menu has **no** Approvals or Audit Log. Type
      http://localhost:3000/audit-log in the address bar: you see "Not allowed".
- [ ] 1.6 As the rep, log out and type a wrong password 5 times. The 6th try says logging in is
      **paused for 15 minutes**. (Use another email for the rest, or wait 15 minutes.)
- [ ] 1.7 As Admin: **Settings → Users**. The rep is listed. Use the **⋯** menu: **Make Admin**,
      then **Make User** again. Each asks for confirmation.
- [ ] 1.8 **Invite person** with any email: you get a link to copy. Open it in the second browser,
      set a name and password, then log in with it.
- [ ] 1.9 **Deactivate** the test rep. In the rep's browser, click anything: "Access disabled,
      contact your admin". Logging in is refused. **Reactivate**: they can log in again.
- [ ] 1.10 Try to deactivate yourself: it's blocked.
- [ ] 1.11 **Create password reset link** for the rep, open it in the second browser, set a new
      password, and log in with it.
- [ ] 1.12 **Change password** (bottom left) for yourself works, and other devices are logged out.

## 2. Library: personas, account filters, templates and approvals (F04–F07)

- [ ] 2.1 **Personas** shows the 5 starting personas with tiers. **Account Filters** shows 6, and
      **Templates** shows 12.
- [ ] 2.2 As Admin, add a persona, edit it (the change history shows the change), then archive it.
- [ ] 2.3 As the rep, **Propose** a new template. It shows as Proposed and Personal.
- [ ] 2.4 As Admin, **Approvals** shows it. Open it, **Reject** it with a note. As the rep, the
      note is visible. Propose again; as Admin, **Approve**. It becomes Official.
- [ ] 2.5 Edit a template body: a new revision is kept and the old text can still be seen.
- [ ] 2.6 **Duplicate** an Official item as the rep: you get your own Personal copy to edit.

## 3. People and companies (F02, F03)

- [ ] 3.1 As the rep: **People → Add person** with a LinkedIn link and a new company name. You're
      taken to the person page; the company was created.
- [ ] 3.2 Add the same person again with a different form of the link (add `www.`, `?utm_...`,
      or use `in.linkedin.com`): it's refused with "Already added by {owner}" and a link.
- [ ] 3.3 Put a Sales Navigator link in the LinkedIn field: refused, with a pointer to the Sales
      Navigator field.
- [ ] 3.4 As Admin, open the rep's person: you can edit it. As a second rep (or after making the
      Admin a User), you see "This lead is claimed by…" but can still **add a note**.
- [ ] 3.5 **People** filters (owner, persona, stage, next action Overdue/Today/This week) and
      search work; **Export CSV** downloads what you see.
- [ ] 3.6 As Admin, tick two people and **Reassign** them to another owner.
- [ ] 3.7 Set a person's stage to **Lost** without a reason: refused. With a reason: saved, and
      the timeline shows the stage change.
- [ ] 3.8 **Companies**: open the company, see its people, then **Mark as customer** with a plan,
      a deal value in ₹ and a start date.

## 4. Daily work: quick-log and Dashboard (F15, F11)

- [ ] 4.1 On a person (not on a plan), use **Log what happened**: Request sent (tick "with a note"
      or not) → Accepted → Message sent. Because it's the same day as Accepted, a **"This breaks a
      cadence guardrail"** box appears; click **Log anyway**. Then Got a reply (choose a type) →
      Meeting booked (pick a date) → Meeting held → Proposal sent. The stage moves each time:
      Contacted, Connected, Replied, Meeting scheduled, Meeting done, Proposal sent.
- [ ] 4.2 **Call**: pick an outcome (for example No answer). It shows in the timeline.
- [ ] 4.3 **Edit** → stage Trial → Save. Then **Mark converted**: stage Paid, and the page offers
      to mark the company as a customer. **Mark lost** asks for a reason.
- [ ] 4.4 **Dashboard**: this week's funnel counts the lead once at every stage (Contacted is
      their first touch). Tiles show "low sample". Switch to **Month**, use the arrows, try each
      **Break down by** option, and see the **Plans** table at the bottom.

## 5. AI Resources and Settings (F20, F13)

- [ ] 5.1 **AI Resources** (sidebar): the 8 starting knowledge files are listed, AI guardrails
      last with "Placed last". As Admin, set the **Calendar link for demos** (it must start with
      `https://`) and **Save link**. Open a file, **Edit**, change a line, **Save**: it shows
      version 2, and "Earlier versions" keeps the old text.
- [ ] 5.2 **Sales resources** tab: **Add resource** → upload a small PDF deck, then **Add a link**
      for a product video. As the rep, open the files and **Download** the PDF; there's no Edit,
      Add or Remove button. A file over 5 MB, or a .docx, is refused with a clear message.
- [ ] 5.3 **Settings → Playbook Settings**: the follow-up delays are gone; the cadence guardrail
      values are there (message 1–3 days after accepting, 3-day gaps, 4 follow-ups, 2 touches a
      week, 30/45-day plans, 60-day Nurture). As Admin, try setting "Message after accepting: at
      most" below "at least": refused.

## 6. Today and the AI (F08, F09, F10)

Needs the knowledge files (5.1; loaded by `npm run seed:knowledge`), and either a real key or `AI_FAKE=1` (see step 0).

- [ ] 6.1 As the rep, log **Got a reply** on two leads. **Today** shows them under Replies
      waiting, with the "x of 20 requests sent" bar and a suggested persona.
- [ ] 6.2 **Rank with AI**: the list is reordered with a short reason under each task and a
      2-sentence summary of your week appears.
- [ ] 6.3 **Mark replied** on one task: it disappears and the lead's timeline shows "Responded".
      **Snooze** the other: it disappears until tomorrow.
- [ ] 6.4 On a person page, in **Conversation**, choose **From {their name}**, paste their message
      and click **Add to conversation**. Then **AI assistant → Suggest next message**. You get a
      reply type (change it: "Reply type saved"), 2–3 replies with approach labels, an **Expect a
      reply by** date, a suggested next step, and flags if they asked something the knowledge
      files don't cover.
- [ ] 6.5 With a real key, read the suggestions carefully: 2–4 lines, friendly, **no invented
      features or prices**, the partner panel never called proprietary, and two 20-minute demo
      slots plus your calendar link when the prospect is interested.
- [ ] 6.6 Edit a suggestion a little and **Mark as sent**: it's logged as a message. **Confirm**
      the next step: stage and next action update.
- [ ] 6.7 **Summarise conversation**: one click summarises the conversation: a summary, needs,
      objections and a next step; **Save as note** adds it to the conversation.
- [ ] 6.8 **Draft message**: choose a template and click **Draft**. The placeholders are filled
      in; **Mark as sent** logs it.
- [ ] 6.9 Without a key (normal `npm run dev`, no `OPENAI_API_KEY`): the AI panel says "AI isn't
      set up yet" and everything else still works.

## 7. Audit Log and About (F14, F16)

- [ ] 7.1 As Admin, **Audit Log** lists everything you did today with before/after values. Filters
      and **Export CSV** work. There's no edit or delete anywhere.
- [ ] 7.2 Each detail page (person, company, persona, template, settings) has a readable **Change
      history** (names, not codes).
- [ ] 7.3 **About** shows version 2.0.0 and the latest releases.

## 8. Plans (F17) and the plan-driven Today (F08)

Tip: on the **About** page there's a **Test date** box (only on your own Mac). It lets you
pretend today is another date, so you can check late steps and weekends without waiting.
Set it back to today when you're done.

- [ ] 8.1 **Plans → Official Outreach**: 5 steps. Step 4 says "Call if a phone is known →
      otherwise Email if an email is known → otherwise LinkedIn message". Waits 2, 4, 7, 10; "Skip
      weekends: on"; "This plan follows every guardrail".
- [ ] 8.2 **Approvals** lists 3 draft plans (Meeting follow-up, Trial, Onboarding). Open each,
      read the steps, and **Approve** the ones you're happy with (or edit them first).
- [ ] 8.3 **Builder**: open Official Outreach → **Duplicate** → **Edit steps**. **Add step** (wait 14)
      → Save: refused, because the plan would run past 30 days. Add one more → Save: refused, "At
      most 4 follow-ups after Message 1". Remove them, set step 4's wait to 3 → refused, "each gap
      must be longer than the last". The guardrail box updates as you type.
- [ ] 8.4 Test date: a Monday. **People** → tick a test lead → **Enrol in plan** → Official
      Outreach: "1 enrolled". **Today** shows it under **Plan steps due today**; click **Done**.
- [ ] 8.5 On the person page the Plan panel says "Waiting for … to accept". Test date: Thursday;
      click **Accepted**. Message 1 is due Monday (Saturday moved to Monday).
- [ ] 8.6 Test date: the next Thursday (3 days late). Today shows it under **Overdue steps** with
      the message filled in. Leave a `{topic}` in the text and click Done: refused, "Fill in {topic}
      first". Fix the text and click Done. The next step is due 4 days after **this** date.
- [ ] 8.7 Paste a reply into the **Reply Assistant**: the Plan panel shows **Paused** and the step
      leaves Today (the reply shows under Replies waiting). **Resume**: the step is due again.
- [ ] 8.8 With a phone number on the person, step 4 is a **Call**: try **No answer** (due again the
      next working day) and the other outcomes.
- [ ] 8.9 **Quick-log on a plan**: when a button matches the current step, the app asks "Is this
      step N of their plan?" **Yes** moves the plan on; **No** logs an extra touch.
- [ ] 8.10 **Edit → Do not contact** with a reason: the plan stops and outreach is refused.
- [ ] 8.11 Finished plans and Nurture: when all steps are done, Today offers **Nurture** or
      **Lost**; when Nurture ends, a **Nurture check** offers **Enrol again** or **Lost**.

## 9. Conversations (F18) and the Team tab

- [ ] 9.1 On a person page, **Conversation** shows every message with who sent it, the channel
      and the date and time; your messages on the right, theirs on the left, notes in the
      middle. **Show plan and stage events** reveals plan and stage changes.
- [ ] 9.2 Add **From me** on **Call** with an earlier time: it appears in the right place in the
      order. A time in the future is refused.
- [ ] 9.3 **Paste a whole conversation**: copy a real LinkedIn thread, paste it, **Split into
      messages**. Check From and When for each row (fix any), untick anything already there,
      **Save**. A reply in it moves them to Replied and pauses their plan.
- [ ] 9.4 With your last message unanswered, **Suggest next message** says to wait until the
      reply-by date. Accept a suggestion with a 2-day **Expect a reply by** date.
- [ ] 9.5 On the About page, set the **Test date** past that date: **Today → Expired reply
      deadlines** shows the person ("nudge 1 of 2"). **Draft nudge**, then **Mark as sent** with
      a new date: the task goes. Clear the test date afterwards.
- [ ] 9.6 As Admin, **Today → Team**: one row per person with due, overdue, done today, on plans
      and replies waiting over 1 day. As the rep, there's no Team link.

## 10. Phone check

- [ ] 10.1 On your phone (or Chrome's device toolbar), Today, People and a person's conversation work: the menu collapses
      to a button, nothing runs off the side of the screen.

---

## Before the team starts (only you can do these)

1. **Put it online:** follow [deploy.md](deploy.md) (Turso database, Netlify site). About 30
   minutes. Then repeat a few checks above on the live address (1.1, 3.1, 4.1, 6.4).
2. **Email (recommended):** add `RESEND_API_KEY` and `EMAIL_FROM` in Netlify (deploy.md step 3) so
   invites and resets are emailed and new sign-ups confirm their email.
3. **AI:** add `OPENAI_API_KEY` in Netlify (a fresh key; see the note on keys in deploy.md). Check the files on **AI Resources** first, since the AI
   only uses what's written there, and set the calendar link.
4. **Passwords:** you, Arijeet and Prince each log in and **Change password** away from the shared
   starting password.
5. **Team:** sign-ups with @lumor.tech work straight away; invite anyone else from Settings →
   Users.
