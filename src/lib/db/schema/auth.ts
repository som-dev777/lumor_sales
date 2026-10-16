import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { ROLES } from "../enums";
import { flag, newId, nowMs, oneOf, timestamp } from "./_shared";

// Better Auth tables. Property names (camelCase) must match Better Auth's field names;
// column names are snake_case like the rest of the database.

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: flag("email_verified").notNull().default(false),
    image: text("image"),
    // Lumor fields (PRD: role, active; D-006: must_change_password)
    role: text("role", { enum: ROLES }).notNull().default("User"),
    active: flag("active").notNull().default(true),
    mustChangePassword: flag("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
    // Empty for the first Admin, who is created by a script.
    createdBy: text("created_by").references((): AnySQLiteColumn => user.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("user_role_check", oneOf("role", ROLES)),
    check("user_active_check", sql`${t.active} IN (0, 1)`),
    check("user_must_change_password_check", sql`${t.mustChangePassword} IN (0, 1)`),
  ],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(nowMs)
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
