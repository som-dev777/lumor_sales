import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { PROPOSAL_DECISIONS, PROPOSAL_ITEM_TYPES } from "../enums";
import { baseColumns, oneOf, timestamp } from "./_shared";
import { user } from "./auth";

export const proposal = sqliteTable(
  "proposal",
  {
    ...baseColumns(() => user.id),
    itemType: text("item_type", { enum: PROPOSAL_ITEM_TYPES }).notNull(),
    // id of the persona, account filter or template (which table depends on item_type).
    itemId: text("item_id").notNull(),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    proposedAt: timestamp("proposed_at")
      .notNull()
      .$defaultFn(() => new Date()),
    decision: text("decision", { enum: PROPOSAL_DECISIONS }).notNull().default("Pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at"),
    reviewerNote: text("reviewer_note"),
  },
  (t) => [
    check("proposal_item_type_check", oneOf("item_type", PROPOSAL_ITEM_TYPES)),
    check("proposal_decision_check", oneOf("decision", PROPOSAL_DECISIONS)),
    index("proposal_decision_idx").on(t.decision),
    index("proposal_item_idx").on(t.itemType, t.itemId),
  ],
);
