import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { COMPANY_STATUSES } from "../enums";
import { baseColumns, oneOf } from "./_shared";
import { accountFilter } from "./account-filter";
import { user } from "./auth";

export const company = sqliteTable(
  "company",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull(),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    industry: text("industry"),
    headcountBand: text("headcount_band"),
    city: text("city"),
    country: text("country"),
    accountFilterId: text("account_filter_id").references(() => accountFilter.id, {
      onDelete: "restrict",
    }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: COMPANY_STATUSES }).notNull().default("Target"),
    planTier: text("plan_tier"),
    // Whole rupees.
    dealValueInr: integer("deal_value_inr"),
    // Plain IST date, YYYY-MM-DD.
    customerStartDate: text("customer_start_date"),
    notes: text("notes"),
  },
  (t) => [
    check("company_status_check", oneOf("status", COMPANY_STATUSES)),
    index("company_owner_idx").on(t.ownerId),
    index("company_status_idx").on(t.status),
  ],
);
