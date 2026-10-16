import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import {
  LIBRARY_STATUSES,
  LIBRARY_TYPES,
  PROPOSAL_STATUSES,
  TEMPLATE_LEVELS,
  TEMPLATE_PURPOSES,
  TEMPLATE_VERSIONS,
} from "../enums";
import { baseColumns, oneOf } from "./_shared";
import { user } from "./auth";
import { persona } from "./persona";

export const template = sqliteTable(
  "template",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull(),
    type: text("type", { enum: LIBRARY_TYPES }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    purpose: text("purpose", { enum: TEMPLATE_PURPOSES }).notNull(),
    personaId: text("persona_id").references(() => persona.id, { onDelete: "restrict" }),
    level: text("level", { enum: TEMPLATE_LEVELS }).notNull().default("Any"),
    // The A/B test variant.
    version: text("version", { enum: TEMPLATE_VERSIONS }).notNull().default("A"),
    body: text("body").notNull(),
    // Edit history: +1 each time the body changes (old bodies in template_revision).
    revision: integer("revision").notNull().default(1),
    status: text("status", { enum: LIBRARY_STATUSES }).notNull().default("Active"),
    proposalStatus: text("proposal_status", { enum: PROPOSAL_STATUSES }).notNull().default("None"),
  },
  (t) => [
    check("template_type_check", oneOf("type", LIBRARY_TYPES)),
    check("template_purpose_check", oneOf("purpose", TEMPLATE_PURPOSES)),
    check("template_level_check", oneOf("level", TEMPLATE_LEVELS)),
    check("template_version_check", oneOf("version", TEMPLATE_VERSIONS)),
    check("template_status_check", oneOf("status", LIBRARY_STATUSES)),
    check("template_proposal_status_check", oneOf("proposal_status", PROPOSAL_STATUSES)),
    index("template_owner_idx").on(t.ownerId),
    index("template_purpose_idx").on(t.purpose),
  ],
);

// Old template bodies, kept when a body is edited (F06, D-007).
export const templateRevision = sqliteTable(
  "template_revision",
  {
    ...baseColumns(() => user.id),
    templateId: text("template_id")
      .notNull()
      .references(() => template.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    body: text("body").notNull(),
  },
  (t) => [unique("template_revision_unique").on(t.templateId, t.revision)],
);
