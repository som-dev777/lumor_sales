# Feature spec: Outreach Desk (per-person conversation thread with AI drafting)

Owner: Somnath · Date: 2026-11-04 · Status: Approved for build
Reference: the working prototype "Lumor Outreach Desk" (claude.ai artifact). This spec reproduces its behaviour inside Lumor Sales Hub.

## 1. What it is

Every person in Sales Hub gets a chat-style thread on their person page. The rep:

1. Writes who the person is ("Who they are" notes).
2. Clicks **Initiate** to get AI-drafted first messages for a chosen channel.
3. Copies a draft, sends it outside the app, and clicks **Mark as sent**.
4. Pastes each reply, tags the channel it came on, and gets AI-drafted responses.
5. Can ask the AI to revise ("make it shorter", "move this to email") or add context at any time.

This is the conversation thread and Reply Assistant from the PRD's F18 (Version 2 scope). Treat this spec as the detailed design for F18. Where it differs from earlier F09/F10/F18 text, this spec wins; record that in decisions.md.

## 2. Where it lives

- **People list (left):** reuse the existing People list. Add a status chip per person, derived from the latest thread entry: **New** (nothing sent yet), **Waiting** (last entry is something we sent), **Replied** (last entry is their reply).
- **Person page (right):** the thread replaces the activity timeline. Header: name, role, company, persona, an **Edit details** button and the existing Plan panel.
- **On phones:** list and thread become one pane each, with a "← People" back button.
- Don't create a second contact list. A person here is the existing Person record.

## 3. Data

Reuse existing tables where possible; add only what's missing.

| Change                                    | Detail                                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person: add `brief`                       | Long text, "Who they are". Editable from the person page                                                                                                                                     |
| Activity: thread entry kinds              | Each thread entry is an Activity row. Add `thread_kind`: `them` (their reply), `sent` (we sent or called), `info` (a note), `ask` (an instruction to the AI), `draft` (AI options, not sent) |
| Activity: `channel`                       | One of: LinkedIn message, LinkedIn connection note, LinkedIn InMail, Email, WhatsApp, Call (map to the existing channel list; add "LinkedIn connection note" if missing)                     |
| Activity: `subject`                       | Used for Email and InMail                                                                                                                                                                    |
| Activity: `draft_options` (JSON)          | For `draft` rows: `[{label, subject, text}]` plus `tip`                                                                                                                                      |
| Activity: `from_draft_id`, `option_index` | On `sent` rows created from a draft, so we can measure which approaches get replies                                                                                                          |
| Settings: `calendar_link`                 | The demo booking link used in every draft (Playbook Settings or AI Knowledge)                                                                                                                |

Rules:

- A `them` row is a "Reply received" activity: it pauses the person's plan and sets the reply type (from the AI's classification, editable by the rep).
- A `sent` row is a "Message sent" activity (or "Call" for the Call channel), with AI suggestion used = yes and the edit level computed against the chosen option.
- `draft`, `ask` and `info` rows never count in the funnel.
- Every write goes through `writeAudit()` and the permission check, as usual.

## 4. Thread UI

**Entries, oldest first:**

| Kind                   | Look                                                                                    | Label                                         |
| ---------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Who they are (`brief`) | Pale yellow note, centred, at the top                                                   | "Who they are"                                |
| `info`                 | Pale yellow note, centred                                                               | "Note"                                        |
| `them`                 | Left-aligned bubble on a card background                                                | "{First name} · {channel}"                    |
| `sent`                 | Right-aligned bubble in the primary colour                                              | "You sent · {channel}" or "You called · Call" |
| `ask`                  | Right-aligned, dashed outline, italic                                                   | "You asked"                                   |
| `draft`                | Full-width card holding 2–3 option cards side by side (stacked on phones), then the tip | "AI drafts · {channel}"                       |

**Each option card:** approach label, subject (Email and InMail only), the text, and two buttons: **Copy** (copies "Subject: …" plus the body) and **Mark as sent** (**Mark as called** for Call). Marking as sent creates a `sent` row with that option's text.

**Empty thread:** a "Start the conversation" panel with an **Initiate** button. It drafts the first message on the selected channel.

**Loading:** a "Drafting…" row with a pulsing dot. The composer's main button is disabled while drafting.

**Composer** (fixed at the bottom of the thread):

- **Mode switch:**

  | Mode            | Placeholder                                                                         | Button            | What happens                                                                            |
  | --------------- | ----------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
  | Their reply     | "Paste what they replied…"                                                          | Add reply & draft | Saves a `them` row on the selected channel, then drafts a response on the same channel  |
  | Info about them | "Add context: their posts, company news, what came up on a call…"                   | Add info          | Saves an `info` row. No draft                                                           |
  | Ask Claude      | "Optional: 'make it shorter', 'mention Intercepts', 'send the follow-up on email'…" | Draft             | With text: saves an `ask` row, then drafts following it. Empty: drafts the next message |

- **Channel dropdown:** the six channels. The choice persists while moving between people.
- **Textarea:** Cmd/Ctrl + Enter submits.
- **Dictate button:** uses the browser's Web Speech API (`SpeechRecognition`, language `en-IN`, interim results) to fill the textarea. If it's unavailable or blocked, show: "Voice input isn't available here. Press the Globe (fn) key twice on a Mac, or Windows + H, to dictate." (Sales Hub is a normal web page, so the microphone should work there, unlike in the prototype.)

**Errors:** plain messages under the composer, for example "Couldn't save. Check your connection and try again." and "The AI couldn't draft that. Try again, or add more context."

## 5. AI drafting

**One server route,** for example `POST /api/ai/draft`, with body `{personId, task, channel, instruction?}`. `task` is one of `first`, `reply`, `next`, `ask`.

**Model:** read from env, `AI_MODEL_WRITING` (default `gpt-5.4-mini`). Use OpenAI **Structured Outputs** (a JSON schema) so the response always parses.

**Prompt assembly** (the order matters; it lets OpenAI's prompt caching discount the repeated part):

1. **Knowledge:** the AI Knowledge files (`docs/ai-knowledge`, or the AI Resources page once built), as the README specifies, with `08-ai-guardrails.md` last.
2. **Writing rules:** section 6, verbatim.
3. **Demo booking link:** `calendar_link`, or `{calendar link}` if empty.
4. **The person:** name, company, role, persona, brief.
5. **Conversation so far:** the last 40 thread entries, formatted as in section 7.
6. **Task:** the matching text in section 8.

**Output schema:**

```json
{
  "options": [
    {
      "label": "2-4 word approach name",
      "subject": "Email/InMail only, else empty",
      "text": "message or talk track"
    }
  ],
  "tip": "1-2 sentences: why these options, what to watch, anything to check or fill in"
}
```

Ask for 2 options (3 when a reply type is ambiguous).

**Output checker** (server side, before saving the draft): reject and retry once if any option contains "proprietary", "just following up", "bumping", "circling back", "no lock-in", "unlimited teammates", an "Nx faster" or "% cheaper"-style claim, or the name of an upcoming feature (from `07-upcoming-features.md`). If it still fails, save the draft with a red warning naming the problem.

**For `reply`:** the tip starts with the reply type (Interested, Asking for details, Not now, Objection, Using a competitor, Not interested). Save it to the `them` row's reply type; the rep can change it.

**Limits:** cap output at about 700 tokens. Apply the per-user daily AI cap (default 50, editable in Playbook Settings).

**Tests:** use the AI stand-in (`AI_FAKE=1`) for e2e. Unit-test prompt assembly, the transcript format and the output checker.

## 6. Writing rules (paste into the prompt verbatim)

```
HOW SOMNATH WRITES
- Sender: {rep name}, {rep title} at Lumor. Write in their first person, plain, warm and specific. Sound like a knowledgeable founder or colleague, never a salesperson. No hype words, no emoji unless the channel is WhatsApp and it fits.
- Hybrid style for first messages: one short line on who they are and what Lumor does, then ONE question about the person's work. Personalise with a real detail from the notes if there is one.
- One message = one question or one call to action. Before a meeting the goal is a 20-minute demo: offer two specific time slots as {slot 1} and {slot 2} plus the booking link.
- Never: "just following up", "bumping this", "circling back", speed or savings claims ("5x faster", "50% cheaper"), invented facts, customers or numbers, competitor bashing, "India-first" framing. Lumor is a live, proven global platform.
- If a value is unknown, leave a visible placeholder like {topic} rather than inventing it.
- If they say no or ask to stop, write one polite close and nothing more.
CHANNEL FORMATS
- LinkedIn connection note: under 200 characters, no pitch.
- LinkedIn message: 2-4 short lines.
- LinkedIn InMail: a subject line plus up to 5 short lines.
- Email: a subject line, 3-6 short lines, sign off "{rep name}, {rep title}, Lumor · lumor.tech".
- WhatsApp: 1-3 short, friendly lines.
- Call: a talk track, not a message: an opening line, 2-3 questions to ask, one likely objection with a response, and a close asking for the demo. Use short lines.
```

`{rep name}` and `{rep title}` come from the logged-in user. For Somnath: "Somnath Chakraborty", "Co-founder".

## 7. Transcript format

```
[{First name} replied via {channel}]
{text}

[{Rep first name} sent via {channel}]        (for Call: "called using this talk track")
Subject: {subject}                            (only if present)
{text}

[Note from {rep first name}]
{text}

[{Rep first name}'s instruction]
{text}

[Drafts offered via {channel}, not sent]
- {option text}
- {option text}
```

## 8. Task text

| Task    | Text                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first` | Draft the FIRST outreach message to this person on: {channel}. If the channel is a LinkedIn message, assume they've just accepted the connection request.                                                                                                         |
| `reply` | They just replied (the last entry). Classify their reply at the start of the tip (Interested, Asking for details, Not now, Objection, Using a competitor, Not interested) and draft the response on: {channel}. Move toward a 20-minute demo unless they said no. |
| `next`  | Draft the next message to send on: {channel}, based on where the conversation stands. If the last message got no reply, the follow-up must add something new.                                                                                                     |
| `ask`   | Follow the rep's latest instruction ("{instruction}") and draft on: {channel}.                                                                                                                                                                                    |

## 9. Unfilled placeholders

Mark as sent is blocked while the option text still contains `{…}`. Show "Fill in {placeholder} first" and let the rep edit the option text inline before marking it sent. The prototype doesn't have inline editing; Sales Hub must.

## 10. Exit check (browser)

1. Add "Who they are" to a person, choose LinkedIn message, click Initiate → 2 options appear with labels and a tip.
2. Copy one → the clipboard has the text. Mark as sent → it appears as a right-hand bubble, and the person's chip shows **Waiting**.
3. Paste a reply tagged WhatsApp → a left-hand bubble; 2–3 WhatsApp-length drafts appear; the tip names the reply type; the chip shows **Replied**; the plan is paused.
4. Ask "make it shorter and move to email" → email drafts with subject lines.
5. Choose Call → a talk track (opener, questions, objection, close), with a **Mark as called** button.
6. Dictate → spoken words appear in the box (or the fallback message shows).
7. Check that a draft never says "proprietary", names an upcoming feature, or makes a speed or savings claim.
