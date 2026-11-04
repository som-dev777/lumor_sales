import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { COMPANY_STATUSES } from "../enums";
import { baseColumns, flag, oneOf } from "./_shared";
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
    // D-021: one company per name, ignoring case and surrounding spaces.
    uniqueIndex("company_name_unique").on(sql`lower(trim(${t.name}))`),
  ],
);

// F28 (D-054): a company's offices. One may be the main (corporate) office; people can be linked
// to an office. Each office has its own owner (the rep who added it, unless changed).
export const companyOffice = sqliteTable(
  "company_office",
  {
    ...baseColumns(() => user.id),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    city: text("city"),
    country: text("country"),
    address: text("address"),
    isMain: flag("is_main").notNull().default(false),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("company_office_company_idx").on(t.companyId),
    index("company_office_owner_idx").on(t.ownerId),
    // One office per name in a company, ignoring case and spaces.
    uniqueIndex("company_office_name_unique").on(t.companyId, sql`lower(trim(${t.name}))`),
    // At most one main office per company.
    uniqueIndex("company_office_one_main")
      .on(t.companyId)
      .where(sql`${t.isMain} = 1`),
  ],
);
