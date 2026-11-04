# F29: Voice typing

- **Priority:** P1 · **Release:** v2.9.0 · **Status:** Done (2.9.0)
- **Decisions:** D-055, D-036 (AI on the server only)

## What it does

Wherever the app asks you to type something for the AI, a **mic** button lets you say it instead,
like the mic in other AI apps: click it, speak, click **Stop**, and what you said is added to the
text box, ready to edit or send.

## Rules

- **Where:** the AI chat on a person (F23), **Ask AI about this company** (F24, P10) and **Paste a
  whole conversation** (F18, P05).
- **How:** the browser records (it asks for the microphone the first time). On Stop the recording
  goes to the app's server, which sends it to OpenAI's speech-to-text (`gpt-4o-mini-transcribe`;
  `whisper-1` when the project can't use it) and returns the text. The text is added after
  anything already typed.
- **Limits:** up to 3 minutes (it stops by itself) and 5 MB. A recording that's empty, too long or
  not sound is refused with a plain message.
- **Nothing is stored:** not the recording, not the text (until you send or save it as usual).
- **Who:** any signed-in user. It needs `OPENAI_API_KEY`, like the other AI features; without it the
  button says the AI isn't set up.
- **Browsers:** Chrome, Edge and Safari (including iPhone). Where a browser can't record, the
  button doesn't show. The browser tests use a stand-in transcript (AI_FAKE).

## Screens

- A mic button next to Send (AI chat), next to Ask (company question) and next to Split into
  messages (paste a conversation). While recording it turns red: **Stop · 0:12**. Then "Writing it
  down…", then the text appears in the box.

## Tests

- Vitest (`src/server/owner-list-4nov-b.test.ts`): empty, too long and non-sound recordings are
  refused; the stand-in transcript in test mode; "AI isn't set up" without a key.
- Browser (`e2e/v29-owner-list.spec.ts`): the mic shows next to the AI chat's Send.

## Change history

| Date       | Version | Change                                        |
| ---------- | ------- | --------------------------------------------- |
| 2026-11-04 | 2.9.0   | Feature doc written; built; released (D-055). |
