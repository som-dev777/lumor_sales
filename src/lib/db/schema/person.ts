import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { LEVELS, LOST_REASONS, SEQUENCE_STEPS, STAGES, TEMPLATE_VERSIONS } from "../enums";
import { baseColumns, flag, oneOf, oneOfOrNull } from "./_shared";
import { accountFilter } from "./account-filter";
import { user } from "./auth";
import { company } from "./company";
import { persona } from "./persona";
import { template } from "./template";

export const person = sqliteTable(
  "person",
  {
    ...baseColumns(() => user.id),
    fullName: text("full_name").notNull(),
    title: text("title"),
    // Public profile link (linkedin.com/in/…), as pasted.
    linkedinUrl: text("linkedin_url").notNull(),
    // Set by the server (F02 normalisation); the duplicate check relies on it being unique.
    linkedinUrlNormalised: text("linkedin_url_normalised").notNull().unique(),
    salesNavUrl: text("sales_nav_url"),
    companyId: text("company_id").references(() => company.id, { onDelete: "restrict" }),
    personaId: text("persona_id").references(() => persona.id, { onDelete: "restrict" }),
    level: text("level", { enum: LEVELS }),
    accountFilterId: text("account_filter_id").references(() => accountFilter.id, {
      onDelete: "restrict",
    }),
    market: text("market"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    stage: text("stage", { enum: STAGES }).notNull().default("Prospect"),
    sequenceStep: text("sequence_step", { enum: SEQUENCE_STEPS }).notNull().default("Not started"),
    openerTemplateId: text("opener_template_id").references(() => template.id, {
      onDelete: "restrict",
    }),
    openerTemplateVersion: text("opener_template_version", { enum: TEMPLATE_VERSIONS }),
    nextAction: text("next_action"),
    // Plain IST date, YYYY-MM-DD.
    nextActionDate: text("next_action_date"),
    // Hidden from Today until this IST date (F08 "Snooze to tomorrow").
    snoozedUntil: text("snoozed_until"),
    lostReason: text("lost_reason", { enum: LOST_REASONS }),
    converted: flag("converted").notNull().default(false),
    convertedDate: text("converted_date"),
    notes: text("notes"),
  },
  (t) => [
    check("person_linkedin_url_check", sql`${t.linkedinUrl} LIKE '%linkedin.com/in/%'`),
    check("person_level_check", oneOfOrNull("level", LEVELS)),
    check("person_stage_check", oneOf("stage", STAGES)),
    check("person_sequence_step_check", oneOf("sequence_step", SEQUENCE_STEPS)),
    check("person_opener_version_check", oneOfOrNull("opener_template_version", TEMPLATE_VERSIONS)),
    check("person_lost_reason_check", oneOfOrNull("lost_reason", LOST_REASONS)),
    // PRD: a lost reason is required when the stage is Lost.
    check("person_lost_needs_reason", sql`${t.stage} <> 'Lost' OR ${t.lostReason} IS NOT NULL`),
    check("person_converted_check", sql`${t.converted} IN (0, 1)`),
    index("person_owner_idx").on(t.ownerId),
    index("person_stage_idx").on(t.stage),
    index("person_next_action_date_idx").on(t.nextActionDate),
    index("person_company_idx").on(t.companyId),
    index("person_persona_idx").on(t.personaId),
  ],
);
