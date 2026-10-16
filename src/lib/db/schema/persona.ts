import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { LIBRARY_STATUSES, LIBRARY_TYPES, PROPOSAL_STATUSES, TIERS } from "../enums";
import { baseColumns, jsonList, oneOf } from "./_shared";
import { user } from "./auth";

export const persona = sqliteTable(
  "persona",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull(),
    type: text("type", { enum: LIBRARY_TYPES }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    functions: jsonList("functions"),
    seniority: jsonList("seniority"),
    jobTitles: jsonList("job_titles"),
    geography: jsonList("geography").default(sql`'["India"]'`),
    tier: integer("tier").notNull(),
    whoItCovers: text("who_it_covers"),
    toolsUsedToday: text("tools_used_today"),
    leadWithAngle: text("lead_with_angle"),
    notes: text("notes"),
    status: text("status", { enum: LIBRARY_STATUSES }).notNull().default("Active"),
    proposalStatus: text("proposal_status", { enum: PROPOSAL_STATUSES }).notNull().default("None"),
  },
  (t) => [
    check("persona_type_check", oneOf("type", LIBRARY_TYPES)),
    check("persona_tier_check", oneOf("tier", TIERS)),
    check("persona_status_check", oneOf("status", LIBRARY_STATUSES)),
    check("persona_proposal_status_check", oneOf("proposal_status", PROPOSAL_STATUSES)),
    index("persona_owner_idx").on(t.ownerId),
  ],
);
