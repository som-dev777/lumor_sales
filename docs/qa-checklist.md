# Manual QA checklist (v1.5.0)

This is for Somnath, to check the whole app by hand before the team uses it. Each step
says what to click and what you should see. Tick the box when it works; if something doesn't,
note the step number and what you saw instead.

The automated tests already cover every rule here (221 checks plus 43 browser walkthroughs).
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
real AI. To try the real AI, put your key in `.env.local` as `ANTHROPIC_API_KEY=...` and run
`npm run dev` again.

---

## 1. Logging in and the team (F01)

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

- [ ] 4.1 On a person, use **Log what happened** in order: Request sent → Accepted → Message 1
      sent → Follow-up 1 sent → Got a reply (choose a reply type) → Demo booked (pick a date) →
      Demo held. After each click, Stage, Sequence step and **Next action** with its date update
      (follow-ups count from the Message 1 date: +4, +7, +10 days).
- [ ] 4.2 **Edit** → stage Trial/Pilot → Save. Then **Mark converted**: stage Paid, and the page
      offers to mark the company as a customer.
- [ ] 4.3 **Mark lost** asks for a reason.
- [ ] 4.4 **Dashboard**: this week's funnel counts the lead once at every stage. Tiles show
      "low sample" (fewer than 10). Switch to **Month**, use the arrows, and try each **Break down
      by** option.

## 5. Settings (F12, F13)

- [ ] 5.1 **Settings → Product Facts**: a warning says the AI facts are missing. As Admin, **Edit**,
      fill in What Lumor does and Live features, and add a calendar link (it must start with
      `https://`). Save: the warning goes, and "Last edited by" shows you.
- [ ] 5.2 As the rep, Product Facts is readable with no Edit button.
- [ ] 5.3 **Settings → Playbook Settings**: as Admin, set Follow-up 1 to 3 days. Setting Follow-up 2
      lower than Follow-up 1 is refused. Log a Message 1 on a lead: Follow-up 1 is due in 3 days.
      Set it back to 4.

## 6. Today and the AI (F08, F09, F10)

Needs Product Facts filled in (5.1), and either a real key or `AI_FAKE=1` (see step 0).

- [ ] 6.1 As the rep, log **Got a reply** on two leads. **Today** shows them under Replies
      waiting, with the "x of 20 requests sent" bar and a suggested persona.
- [ ] 6.2 **Rank with AI**: the list is reordered with a short reason under each task and a
      2-sentence summary of your week appears.
- [ ] 6.3 **Mark replied** on one task: it disappears and the lead's timeline shows "Responded".
      **Snooze** the other: it disappears until tomorrow.
- [ ] 6.4 On a person page, **AI assistant → Reply Assistant**: paste a prospect's message and
      click **Suggest replies**. The message is in the timeline right away. You get a reply type
      (change it: "Reply type saved"), 2–3 replies with approach labels, a suggested next step,
      and flags if the prospect asked something Product Facts doesn't cover.
- [ ] 6.5 With a real key, read the suggestions carefully: 2–4 lines, friendly, **no invented
      features or prices**, the partner panel never called proprietary, and two 20-minute demo
      slots plus your calendar link when the prospect is interested.
- [ ] 6.6 Edit a suggestion a little and **Mark as sent**: it's logged as a message. **Confirm**
      the next step: stage and next action update.
- [ ] 6.7 **Summarise conversation**: paste a thread, get a summary, needs, objections and a next
      step; **Save as note** adds it to the timeline.
- [ ] 6.8 **Draft message**: choose a template and click **Draft**. The placeholders are filled
      in; **Mark as sent** logs it.
- [ ] 6.9 Without a key (normal `npm run dev`, no `ANTHROPIC_API_KEY`): the AI panel says "AI isn't
      set up yet" and everything else still works.

## 7. Audit Log and About (F14, F16)

- [ ] 7.1 As Admin, **Audit Log** lists everything you did today with before/after values. Filters
      and **Export CSV** work. There's no edit or delete anywhere.
- [ ] 7.2 Each detail page (person, company, persona, template, settings) has a readable **Change
      history** (names, not codes).
- [ ] 7.3 **About** shows version 1.5.0 and the latest releases.

## 8. Phone check

- [ ] 8.1 On your phone (or Chrome's device toolbar), Today and People work: the menu collapses
      to a button, nothing runs off the side of the screen.

---

## Before the team starts (only you can do these)

1. **Put it online:** follow [deploy.md](deploy.md) (Turso database, Netlify site). About 30
   minutes. Then repeat a few checks above on the live address (1.1, 3.1, 4.1, 6.4).
2. **Email (recommended):** add `RESEND_API_KEY` and `EMAIL_FROM` in Netlify (deploy.md step 3) so
   invites and resets are emailed and new sign-ups confirm their email.
3. **AI:** add `ANTHROPIC_API_KEY` in Netlify. Fill in **Product Facts** fully first, since the AI
   only uses what's written there.
4. **Passwords:** you, Arijeet and Prince each log in and **Change password** away from the shared
   starting password.
5. **Team:** sign-ups with @lumor.tech work straight away; invite anyone else from Settings →
   Users.
