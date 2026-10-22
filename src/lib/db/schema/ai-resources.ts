import { sql } from "drizzle-orm";
import { blob, check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS } from "../enums";
import { baseColumns, flag, oneOf, timestamp } from "./_shared";
import { user } from "./auth";

// AI Resources (F20): the AI knowledge base and the sales resources reps download.

export const knowledgeFile = sqliteTable(
  "knowledge_file",
  {
    ...baseColumns(() => user.id),
    // e.g. "01-company-and-positioning"; unique, so the seed never adds a file twice.
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // The prompts that read this file (P01–P04), as JSON.
    loadFor: text("load_for", { mode: "json" }).$type<string[]>().notNull(),
    // Placed after the other files, so its rules win (the guardrails file).
    placeLast: flag("place_last").notNull().default(false),
    active: flag("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    version: integer("version").notNull().default(1),
    lastEditedBy: text("last_edited_by").references(() => user.id, { onDelete: "restrict" }),
    lastEditedAt: timestamp("last_edited_at"),
  },
  (t) => [
    check("knowledge_file_place_last_check", sql`${t.placeLast} IN (0, 1)`),
    check("knowledge_file_active_check", sql`${t.active} IN (0, 1)`),
  ],
);

// Earlier text of a knowledge file, kept on every change (F20).
export const knowledgeRevision = sqliteTable(
  "knowledge_revision",
  {
    ...baseColumns(() => user.id),
    fileId: text("file_id")
      .notNull()
      .references(() => knowledgeFile.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
  },
  (t) => [unique("knowledge_revision_unique").on(t.fileId, t.version)],
);

export const salesResource = sqliteTable(
  "sales_resource",
  {
    ...baseColumns(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category", { enum: RESOURCE_CATEGORIES }).notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull(),
    // For links.
    url: text("url"),
    // For files.
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
  },
  (t) => [
    check("sales_resource_category_check", oneOf("category", RESOURCE_CATEGORIES)),
    check("sales_resource_kind_check", oneOf("kind", RESOURCE_KINDS)),
    check(
      "sales_resource_shape_check",
      sql`(${t.kind} = 'link' AND ${t.url} IS NOT NULL) OR (${t.kind} = 'file' AND ${t.fileName} IS NOT NULL)`,
    ),
    index("sales_resource_category_idx").on(t.category),
  ],
);

// The bytes of an uploaded sales resource (5 MB at most, D-037), kept apart from the list.
export const salesResourceFile = sqliteTable("sales_resource_file", {
  resourceId: text("resource_id")
    .primaryKey()
    .references(() => salesResource.id, { onDelete: "restrict" }),
  data: blob("data", { mode: "buffer" }).notNull(),
});
