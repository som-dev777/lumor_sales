# Lumor Sales Hub: documentation

Lumor Sales Hub is the internal web app where Lumor's sales team manages LinkedIn
prospecting, from finding a lead in Sales Navigator to a paying customer.

**Current version:** 1.5.0 (R6 AI, released 17 Oct 2026). All six planned releases are done; see [qa-checklist.md](qa-checklist.md) and [deploy.md](deploy.md).

## Documents

| Document                                     | What it holds                                                    |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [PRD.md](PRD.md)                             | Product requirements. The source of truth.                       |
| [CHANGELOG.md](CHANGELOG.md)                 | Every change, grouped by release.                                |
| [data-model.md](data-model.md)               | Every database table, column, rule and trigger.                  |
| [roles-permissions.md](roles-permissions.md) | Who can do what, and how the server enforces it.                 |
| [ai-prompts.md](ai-prompts.md)               | The AI prompts, word for word, with versions.                    |
| [decisions.md](decisions.md)                 | Significant choices and why they were made.                      |
| [deploy.md](deploy.md)                       | Putting the app online (Turso + Netlify), step by step.          |
| [qa-checklist.md](qa-checklist.md)           | The manual check of the whole app before the team uses it.       |
| [features/](features/)                       | One file per feature (F01–F16): requirements, tests, change log. |
| [../CLAUDE.md](../CLAUDE.md)                 | Standing rules every Claude Code session follows.                |

## Feature index

| ID  | Feature                                                         | Priority | Release | Status       |
| --- | --------------------------------------------------------------- | -------- | ------- | ------------ |
| F01 | [Auth and users](features/F01-auth-users.md)                    | P0       | R1      | Done (1.0.0) |
| F14 | [Audit Log](features/F14-audit-log.md)                          | P0       | R1      | Done (1.0.0) |
| F16 | [About and releases](features/F16-about-releases.md)            | P0       | R1      | Done (1.0.0) |
| F04 | [Personas](features/F04-personas.md)                            | P0       | R2      | Done (1.1.0) |
| F05 | [Account filters](features/F05-account-filters.md)              | P0       | R2      | Done (1.1.0) |
| F06 | [Templates](features/F06-templates.md)                          | P0       | R2      | Done (1.1.0) |
| F07 | [Approvals](features/F07-approvals.md)                          | P1       | R2      | Done (1.1.0) |
| F02 | [People](features/F02-people.md)                                | P0       | R3      | Done (1.2.0) |
| F03 | [Companies](features/F03-companies.md)                          | P0       | R3      | Done (1.2.0) |
| F15 | [Quick-log and sequence automation](features/F15-quick-log.md)  | P0       | R4      | Done (1.3.0) |
| F11 | [Dashboard](features/F11-dashboard.md)                          | P0       | R4      | Done (1.3.0) |
| F12 | [Product Facts](features/F12-product-facts.md)                  | P0       | R5      | Done (1.4.0) |
| F13 | [Playbook Settings](features/F13-playbook-settings.md)          | P0       | R5      | Done (1.4.0) |
| F08 | [Today planner](features/F08-today-planner.md)                  | P1       | R6      | Done (1.5.0) |
| F09 | [Reply Assistant](features/F09-reply-assistant.md)              | P1       | R6      | Done (1.5.0) |
| F10 | [Conversation summary and draft](features/F10-summary-draft.md) | P1       | R6      | Done (1.5.0) |

## Releases

| Release       | Version | Features           | Status              |
| ------------- | ------- | ------------------ | ------------------- |
| R1 Foundation | 1.0.0   | F01, F14, F16      | Released 2026-10-16 |
| R2 Library    | 1.1.0   | F04, F05, F06, F07 | Released 2026-10-17 |
| R3 Leads      | 1.2.0   | F02, F03           | Released 2026-10-17 |
| R4 Daily work | 1.3.0   | F15, F11           | Released 2026-10-17 |
| R5 Settings   | 1.4.0   | F12, F13           | Released 2026-10-17 |
| R6 AI         | 1.5.0   | F08, F09, F10      | Released 2026-10-17 |

## Running the app locally

See the [project README](../README.md).
