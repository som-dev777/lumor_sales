# F20: AI Resources

- **Priority:** P0 · **Release:** v2.1.0 (before R8) · **Status:** In progress
- **Decisions:** D-037 (owner's choices on 2026-10-22), D-036 (AI on OpenAI)
- **Replaces:** F12 Product Facts (its calendar link moves here)

## What it does

A new **AI Resources** page in the sidebar with two parts:

1. **AI knowledge:** the Markdown files that are the only facts the AI may use about Lumor.
   Every AI feature (Today's Rank with AI P01, Reply Assistant P02, Summarise P03, Draft P04)
   reads them when it runs, so an edit applies at once.
2. **Sales resources:** decks, product videos, one-pagers and images that reps can open,
   download or copy a link to.

## AI knowledge

- **Starting set:** the 9 files in `docs/ai-knowledge/` (the owner's knowledge base, verified
  2026-10-22). The 8 numbered files are loaded by `npm run seed:knowledge`, which adds files that
  don't exist yet and never overwrites edits. The knowledge base's README stays in the docs.
- **Each file has:** a title, its Markdown text, the prompts that read it (P01–P04), whether it's
  **placed last** (its rules win), whether it's **active**, a version number and its earlier
  versions.
- **Which prompts read which file** (from the knowledge base's README):

  | File                                                                                                                | Read by                   |
  | ------------------------------------------------------------------------------------------------------------------- | ------------------------- |
  | 01 Company and positioning, 02 Survey platform, 03 Panel and Intercepts, 04 Pricing and plans, 07 Upcoming features | every prompt              |
  | 05 Customers and personas                                                                                           | P01, P02, P04             |
  | 06 Objections and FAQ                                                                                               | P02, P03                  |
  | 08 AI guardrails                                                                                                    | every prompt, placed last |

- **How the AI gets them:** the active files for that prompt, in file order, with "placed last"
  files at the end, as a KNOWLEDGE BASE section at the start of the AI's input, plus the
  CALENDAR LINK. If no file is active for a prompt, the AI doesn't run and says the knowledge
  base needs files.
- **Admins** can add a file (paste Markdown or upload a `.md` file), edit its text, replace it by
  uploading a new `.md`, change which prompts read it, switch it on or off, and see earlier
  versions. Each save keeps the previous text as a version and writes an audit entry.
  **Everyone** can read the files.
- **Calendar link:** one setting on this page (Admins edit), used by the AI when it offers demo
  slots. It must be a full `https://` link.

## Sales resources

- **Two kinds:**
  - **A file:** PDF, JPG, PNG, MD or MP4, up to **5 MB**. It's stored in the app's database, so
    it works the same locally and online, and it's included in database backups.
  - **A link:** any `https://` address. Use links for videos and large decks (Google Drive,
    Loom, YouTube, Vimeo), because the online host can't take uploads over about 6 MB (D-037).
- **Each resource has:** a title, a short description, a category (Sales deck, Product video,
  One-pager, Case study, Image, Other), and who added it and when.
- **Everyone** can browse by category and open, download or copy the link. **Admins** add and
  remove resources. Every add and removal writes an audit entry.
- Files are served only to signed-in users, with their original filename.

## Screens

- **AI Resources** (sidebar, after Plans): tabs **AI knowledge** and **Sales resources**.
- **AI knowledge:** the calendar link, then one card per file (title, prompts that read it,
  placed last, active, version, last edited). Open a file to read it; Admins see Edit, Replace
  with a file, prompt checkboxes, Active and the earlier versions.
- **Sales resources:** grouped by category, each with Open or Download and Copy link; Admins
  see Add resource and Remove.
- **Settings → Product Facts** now sends people to AI Resources.

## Tests

- Automated:
  - prompt file selection (P01–P04 per the table, placed-last order, inactive files skipped)
  - editing keeps versions and is audited
  - only Admins change knowledge and resources
  - file type and the 5 MB limit
  - links must be https
  - downloads need sign-in
  - the seed is idempotent and loads the 8 files word for word
  - the AI refuses to run with an empty knowledge base
- Browser: an Admin sees the 8 starting files, edits one and sees the new version; adds a
  small PDF and a video link; a rep can read the files and download the PDF, with no edit or
  add buttons.

## Change history

| Date       | Version    | Change                                                                                                                                                                        |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-22 | Unreleased | Feature doc written, before code.                                                                                                                                             |
| 2026-10-22 | 2.1.0      | Built: knowledge files with versions, calendar link, sales resources (5 MB uploads and links), downloads for signed-in users, prompts v1.2; seed:knowledge; F20 browser test. |
