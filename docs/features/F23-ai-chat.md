# F23: AI chat on a person

- **Priority:** P1 · **Release:** v2.5.0 · **Status:** Done
- **Decisions:** D-041 (the owner's requests of 2026-11-02)

## What it does

A chat with the AI on each person's page, like ChatGPT, for working out what to say next. The
AI already knows the person, their company, the whole conversation, the team's reply templates
and the AI knowledge base. The rep talks it through, asks for a message, asks for changes, and
when a message is right, clicks **Use this message**: it opens in an editor, and **Mark as
sent** records it in the conversation as the message sent.

It replaces the **Suggest next message** tab on the person page. Today keeps its one-click
**Suggest message** (P02).

## Rules

- **Who:** the lead's owner or an Admin (same as the other AI tools, `lead.edit`).
- **Private:** a chat belongs to the rep who started it. Nobody else sees it, Admins included.
- **Saved:** chats are kept on the person, so the rep can come back later. **New chat** starts a
  fresh one; earlier chats stay in the **Chats** list and can be continued.
- **What the AI gets (P07):** the knowledge base (the files used for Suggest next message), the
  calendar link, today's date, the person, the persona's angle, where the conversation stands
  (who wrote last, the reply-by date, nudges), the whole conversation, the reply templates, the
  deadline rules, and the chat so far (the last 40 messages).
- **What comes back:** a reply to the rep, and, when the rep asked for a message or the AI
  recommends one, 1 to 3 **drafts** (approach label and text). Drafts follow the prospect
  guardrails; the reply can discuss strategy freely but takes facts about Lumor only from the
  knowledge base. Questions the knowledge base can't answer come back as flags.
- **Use this message:** opens the draft in the same editor as before: edit, copy, pick the
  channel, confirm the reply-by date, **Mark as sent**. That logs the message with "AI
  suggestion used", the approach and the edit level, and sets the reply-by date and nudge
  count as Suggest next message did.
- **Reply type:** when the prospect wrote last and their message has no reply type, the AI's
  choice is saved on it (as before).
- **Starters:** with an empty chat, one-click starters: "Suggest my next message", "How should
  I handle their objection?", "Write a short follow-up".
- **Audit:** each exchange writes an audit entry on the chat (message count, not the text, to
  keep chats private). New chat and deleting a chat are audited too.
- **Limits:** 2,000 characters per message; 200 messages per chat (then start a new chat).

## Screens

- **Person page → AI assistant → Chat** (first tab; then Summarise conversation and Draft
  message): the chat history with the rep's messages on the right and the AI's on the left;
  draft cards under the AI message with **Use this message**; a message box (Enter sends,
  Shift+Enter makes a new line); **New chat**, **Chats** (earlier chats) and **Delete chat**.

## Tests

- Automated: chat saved per person and per rep and private; only the owner or an Admin can
  chat; the AI receives the conversation and the chat so far; drafts limited to 3; reply type
  saved; the 200-message limit; audit entries without the text.
- Browser: a rep asks for a message, asks for it shorter, uses it, marks it as sent, and it's in
  the conversation; the chat is still there after reloading.

## Change history

| Date       | Version | Change                                                                                                      |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | 2.5.0   | Feature doc written (before code).                                                                          |
| 2026-11-02 | 2.5.0   | Built: chat tables (migration 0011), P07, the Chat tab, reply-type picker kept; tests.                      |
| 2026-11-02 | 2.5.0   | Released in v2.5.0.                                                                                         |
| 2026-11-04 | 2.8.0   | P07 v1.1: demo invitations give the rep's booking link, or ask for a date and time that suits them (D-054). |
