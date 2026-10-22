# Lumor AI knowledge base

These files are the single source of truth for every AI feature in Lumor Sales Hub: the Today planner (P01), the Reply Assistant (P02), Summarise conversation (P03) and Draft message (P04). The AI may state a fact about Lumor only if it appears in these files.

Last verified: 2026-10-22, against lumor.tech, lumor.tech/platform, lumor.tech/pricing, the app's recruitment screen, and answers from Somnath (co-founder) on the same date.

## Files

| File | What it covers | Loaded for |
| --- | --- | --- |
| `01-company-and-positioning.md` | Who Lumor is, the one-line pitch, positioning rules, tone | Every prompt |
| `02-survey-platform.md` | Everything live in the survey product | Every prompt |
| `03-panel-and-intercepts.md` | Respondent recruitment, how panel orders work, Intercepts | Every prompt |
| `04-pricing-and-plans.md` | Plans, prices, limits, what to say about pricing | Every prompt |
| `05-customers-and-personas.md` | Who buys, their pains, the angle for each | P01, P02, P04 |
| `06-objections-and-faq.md` | Common questions and objections, with approved answers | P02, P03 |
| `07-upcoming-features.md` | What is NOT live yet and how to talk about it | Every prompt |
| `08-ai-guardrails.md` | Hard rules for the AI, and when to escalate to a human | Every prompt, placed last |

## How the app uses them

1. Every AI call loads `01`, `02`, `03`, `04`, `07` and `08`. Prompts that write or judge messages also load `05` and `06`.
2. `08-ai-guardrails.md` is placed last in the prompt so its rules take priority.
3. If a fact isn't in these files, the AI says "I'll check and come back to you" and raises a flag. It never fills the gap from general knowledge.

## Status labels used in these files

- **Live:** available in the product today. The AI can describe and offer it.
- **Upcoming:** on the roadmap, not available. Rules in `07-upcoming-features.md` apply.
- **Needs confirmation:** a fact the team must confirm before the AI may use it. The AI must not use anything with this label. (None open right now.)

## Decisions recorded (2026-10-22)

| Question | Answer |
| --- | --- |
| Seats | User limits per plan apply (Free 1, Starter 3, Business 15, Enterprise unlimited). The website's "unlimited teammates" line is being updated; the AI never uses it |
| Annual discount | Annual billing is the 30% option on the pricing page |
| Panel on paid plans | Panel recruitment is available on paid plans but paid separately per order. Free plan and free trials have no panel access |
| Intercepts | Available on all plans; each Intercepts project counts as one study |
| Enterprise terms | Annual contract only |
| SMB QR plan | Upcoming; price set later |
| Performance claims ("5x faster", "50–70% lower cost") | Not used anywhere |

## Keeping these files current

- Update the file in the same change as any product, pricing or positioning change.
- Change the "Last verified" date here when you re-check the website.
- When a feature moves from Upcoming to Live, move it from `07` into `02` or `03`.
- Keep facts short and literal. The AI repeats what's written here, so vague wording produces vague answers.
- Never add partner panel names or partner documents (such as a partner's panel book) to these files.
