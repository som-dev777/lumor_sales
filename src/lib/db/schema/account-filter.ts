import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { LIBRARY_STATUSES, LIBRARY_TYPES, PROPOSAL_STATUSES } from "../enums";
import { baseColumns, jsonList, oneOf } from "./_shared";
import { user } from "./auth";

export const accountFilter = sqliteTable(
  "account_filter",
  {
    ...baseColumns(() => user.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: LIBRARY_TYPES }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    industries: jsonList("industries"),
    companyHeadcount: text("company_headcount"),
    hqLocations: jsonList("hq_locations"),
    keyFilters: text("key_filters"),
    exclusions: text("exclusions"),
    keywords: text("keywords"),
    whyItMatters: text("why_it_matters"),
    status: text("status", { enum: LIBRARY_STATUSES }).notNull().default("Active"),
    proposalStatus: text("proposal_status", { enum: PROPOSAL_STATUSES }).notNull().default("None"),
  },
  (t) => [
    check("account_filter_type_check", oneOf("type", LIBRARY_TYPES)),
    check("account_filter_status_check", oneOf("status", LIBRARY_STATUSES)),
    check("account_filter_proposal_status_check", oneOf("proposal_status", PROPOSAL_STATUSES)),
    // Official codes (A1, A2…) are unique; Personal filters may reuse a code.
    uniqueIndex("account_filter_official_code_unique")
      .on(t.code)
      .where(sql`${t.type} = 'Official'`),
    index("account_filter_owner_idx").on(t.ownerId),
  ],
);
