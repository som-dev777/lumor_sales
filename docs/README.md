# Lumor Sales Hub: documentation

Lumor Sales Hub is the internal web app where Lumor's sales team manages LinkedIn
prospecting, from finding a lead in Sales Navigator to a paying customer.

**Current version:** 0.1.0 (R1 Foundation in progress; R1 ships as 1.0.0)

## Documents

| Document                                     | What it holds                                                    |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [PRD.md](PRD.md)                             | Product requirements. The source of truth.                       |
| [CHANGELOG.md](CHANGELOG.md)                 | Every change, grouped by release.                                |
| [data-model.md](data-model.md)               | Every database table, column, rule and trigger.                  |
| [roles-permissions.md](roles-permissions.md) | Who can do what, and how the server enforces it.                 |
| [ai-prompts.md](ai-prompts.md)               | The AI prompts, word for word, with versions (filled in R6).     |
| [decisions.md](decisions.md)                 | Significant choices and why they were made.                      |
| [features/](features/)                       | One file per feature (F01–F16): requirements, tests, change log. |
| [../CLAUDE.md](../CLAUDE.md)                 | Standing rules every Claude Code session follows.                |

## Feature index

| ID  | Feature                                                         | Priority | Release | Status      |
| --- | --------------------------------------------------------------- | -------- | ------- | ----------- |
| F01 | [Auth and users](features/F01-auth-users.md)                    | P0       | R1      | In progress |
| F14 | [Audit Log](features/F14-audit-log.md)                          | P0       | R1      | In progress |
| F16 | [About and releases](features/F16-about-releases.md)            | P0       | R1      | In progress |
| F04 | [Personas](features/F04-personas.md)                            | P0       | R2      | Planned     |
| F05 | [Account filters](features/F05-account-filters.md)              | P0       | R2      | Planned     |
| F06 | [Templates](features/F06-templates.md)                          | P0       | R2      | Planned     |
| F07 | [Approvals](features/F07-approvals.md)                          | P1       | R2      | Planned     |
| F02 | [People](features/F02-people.md)                                | P0       | R3      | Planned     |
| F03 | [Companies](features/F03-companies.md)                          | P0       | R3      | Planned     |
| F15 | [Quick-log and sequence automation](features/F15-quick-log.md)  | P0       | R4      | Planned     |
| F11 | [Dashboard](features/F11-dashboard.md)                          | P0       | R4      | Planned     |
| F12 | [Product Facts](features/F12-product-facts.md)                  | P0       | R5      | Planned     |
| F13 | [Playbook Settings](features/F13-playbook-settings.md)          | P0       | R5      | Planned     |
| F08 | [Today planner](features/F08-today-planner.md)                  | P1       | R6      | Planned     |
| F09 | [Reply Assistant](features/F09-reply-assistant.md)              | P1       | R6      | Planned     |
| F10 | [Conversation summary and draft](features/F10-summary-draft.md) | P1       | R6      | Planned     |

## Releases

| Release       | Version | Features           | Status      |
| ------------- | ------- | ------------------ | ----------- |
| R1 Foundation | 1.0.0   | F01, F14, F16      | In progress |
| R2 Library    | 1.1.0   | F04, F05, F06, F07 | Planned     |
| R3 Leads      | 1.2.0   | F02, F03           | Planned     |
| R4 Daily work | 1.3.0   | F15, F11           | Planned     |
| R5 Settings   | 1.4.0   | F12, F13           | Planned     |
| R6 AI         | 1.5.0   | F08, F09, F10      | Planned     |

## Running the app locally

See the [project README](../README.md).
