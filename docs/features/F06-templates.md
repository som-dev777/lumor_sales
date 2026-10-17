# F06: Templates

- **Priority:** P0 · **Release:** R2 (v1.1.0) · **Status:** In progress
- **PRD:** [Screens → Templates](../PRD.md#screens-and-functional-requirements), [Appendix: seed data](../PRD.md#appendix-seed-data)

## What it does

A library of message templates (openers, follow-ups, break-ups, replies), grouped by
purpose. Each shows how often it's used and its reply rate, so the team can see which
wording works. Versions A/B/C let the team test variants side by side.

## Rules

All the **library rules in [F04](F04-personas.md#library-rules-shared-by-personas-account-filters-f05-and-templates-f06)**
apply. Plus:

1. **Grouped by purpose**, in the PRD's order: Message 1, Follow-up 1, Follow-up 2,
   Break-up, Reply – interested, Reply – details, Reply – not now, Reply – competitor,
   Post-demo recap, InMail.
2. **Version (A/B/C)** is the test variant: two templates with the same purpose and persona
   can be A and B.
3. **Editing the body creates a new revision** (PRD: "creates a new version and keeps the
   old one"). The old body is saved in `template_revision` with its revision number; the
   template's revision goes up by one. A "Revisions" view lists every past body with who
   changed it and when. Editing other fields (name, persona…) doesn't create a revision.
   (A/B/C variant ≠ revision; see D-007.)
4. **Placeholders** such as `{Name}`, `{Company}`, `{topic}` are highlighted in the body.
   The editor lists the placeholders found. They're filled in by Draft message (F10, R6).
5. **Stats:**
   - **Times used:** "Message sent" activities that used this template, plus people whose
     opener template is this one (whichever is larger, so an opener counted both ways
     isn't double-counted).
   - **Reply rate:** of the people messaged with this template, the share with a later
     "Reply received". "—" until it has been used.
   - All zero until activities exist (R3/R4).
6. Persona (optional) and level (Leader / Practitioner / Any) narrow when a template is
   suggested. Archived personas can't be picked.

## Fields

Name (required) · Purpose · Persona (optional) · Level · Version (A/B/C) · Body (required,
up to 2,000 characters).

## Screen: `/templates`

- Tabs Official and Personal, "Show archived", "Mine only".
- Sections by purpose; each template card shows name, version badge, persona, level,
  revision number, the body with highlighted placeholders, stats, owner and actions
  (Edit · Duplicate · Propose · Archive/Restore · Delete · Revisions · History).
- Add/edit dialog.

## Seed data (R2)

The 12 Official version-A templates from the PRD appendix: six "Message 1" openers (Research
& Insights Leader and Practitioner, Product & Design, CX Brand & Marketing, Founders &
Agency Directors, Independent Researchers), Follow-up 1, Follow-up 2, Break-up, and Reply –
interested / not now / competitor. Openers link to their persona and level. Loaded by
`npm run seed:library`.

## Tests

- Automated: a body edit saves the old body as a revision and bumps the number; other edits
  don't; stats; the shared library rules; seed with persona links.
- Browser: covered by the R2 exit-check journey.

## Change history

| Date       | Version    | Change                                                                                  |
| ---------- | ---------- | --------------------------------------------------------------------------------------- |
| 2026-10-16 | Unreleased | Placeholder doc created.                                                                |
| 2026-10-16 | Unreleased | Full doc written (R2).                                                                  |
| 2026-10-16 | Unreleased | Template rules (revisions on wording edits, usage stats) built, with tests.             |
| 2026-10-17 | Unreleased | Seed: 12 Official version-A templates, openers linked to persona and level, with tests. |
