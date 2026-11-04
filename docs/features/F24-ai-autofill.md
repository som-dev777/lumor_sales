# F24: Fill with AI (company and person forms)

- **Priority:** P1 · **Release:** v2.5.0 · **Status:** Done
- **Decisions:** D-041 (the owner's requests of 2026-11-02)

## What it does

A small **Fill with AI** button at the bottom-left of the Add/Edit company and Add/Edit person
forms. The AI searches the web using whatever is typed (a company name alone is enough) and
fills in the fields left empty. The rep checks and edits everything before saving.

## Rules

- **Who:** anyone who can add leads (`lead.create`). Nothing is saved by the button itself.
- **Company (P08)** fills: website, LinkedIn page, industry (from the Industries list; a new name
  only if none fits), headcount band, city and country, account filter, and notes.
- **Person (P09)** fills: job title, persona (from the active personas), level, seniority,
  market, account filter, and notes. It needs the full name, plus the company or LinkedIn link.
- **Location rule:** city and country are always an office **in India**, with **Bangalore** first
  when the company has one. If the headquarters is outside India, the notes say so (for example
  "Headquarters: London, United Kingdom"). With no Indian office, city stays empty and the notes
  say so.
- **Only empty fields are filled.** Anything typed or chosen stays. Notes are added below
  existing notes.
- **Marked:** each filled field shows "Filled by AI. Check it." until edited.
- **The AI's answer** also has a confidence (high, medium, low), up to 3 sources and things to
  check; these show above the buttons. With low confidence nothing is filled, and the message
  says to add the website or LinkedIn link and try again.
- **Web search:** uses OpenAI's web search, searching from Bangalore, India. If the OpenAI
  project's model can't search, the AI answers from what it knows and says so.
- **Time limit:** 60 seconds (web search takes longer than other AI answers).
- **Cost:** each click uses some OpenAI credit (a few US cents with search).

## Screens

- **Add/Edit company** and **Add/Edit person** dialogs: **Fill with AI** (left of Cancel), a
  "Searching the web… (up to a minute)" line while it works, and the result box.

## Tests

- Automated: only empty fields are filled; names from the lists are matched to their ids; an
  unknown persona or account filter is ignored; a new industry only when none fits; low
  confidence fills nothing; the location rule is in the prompt; only users who can add leads.
- Browser (AI in test mode): type a company name, Fill with AI, fields filled and marked, edit
  one, save.

## Change history

| Date       | Version | Change                                                                                                                                                                                               |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | 2.5.0   | Feature doc written (before code).                                                                                                                                                                   |
| 2026-11-02 | 2.5.0   | Built: P08/P09 with OpenAI web search (checked live: 10–15 seconds), Fill with AI on both forms, "Filled by AI" hints; tests.                                                                        |
| 2026-11-02 | 2.5.0   | Released in v2.5.0.                                                                                                                                                                                  |
| 2026-11-04 | 2.8.0   | Fixed: after Fill with AI, a refused save looked like "nothing happens" (the message was out of view); it now shows next to the buttons. Ask AI about this company opens after filling (P10, D-054). |
| 2026-11-04 | 2.9.0   | Mic on Ask AI about this company (F29) (D-055).                                                                                                                                                      |
