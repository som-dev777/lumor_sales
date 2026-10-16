import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ROLES } from "../enums";
import { baseColumns, oneOf, timestamp } from "./_shared";
import { user } from "./auth";

// Invite-only signup (F01, D-007). Only a hash of the link's secret is stored.
export const invite = sqliteTable(
  "invite",
  {
    ...baseColumns(() => user.id),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("User"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
  },
  () => [check("invite_role_check", oneOf("role", ROLES))],
);
