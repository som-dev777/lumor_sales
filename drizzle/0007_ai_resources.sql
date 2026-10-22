CREATE TABLE `knowledge_file` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`load_for` text NOT NULL,
	`place_last` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_edited_by` text,
	`last_edited_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`last_edited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "knowledge_file_place_last_check" CHECK("knowledge_file"."place_last" IN (0, 1)),
	CONSTRAINT "knowledge_file_active_check" CHECK("knowledge_file"."active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_file_slug_unique` ON `knowledge_file` (`slug`);--> statement-breakpoint
CREATE TABLE `knowledge_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`file_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`file_id`) REFERENCES `knowledge_file`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_revision_unique` ON `knowledge_revision` (`file_id`,`version`);--> statement-breakpoint
CREATE TABLE `sales_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sales_resource_category_check" CHECK("category" IN ('Sales deck', 'Product video', 'One-pager', 'Case study', 'Image', 'Other')),
	CONSTRAINT "sales_resource_kind_check" CHECK("kind" IN ('file', 'link')),
	CONSTRAINT "sales_resource_shape_check" CHECK(("sales_resource"."kind" = 'link' AND "sales_resource"."url" IS NOT NULL) OR ("sales_resource"."kind" = 'file' AND "sales_resource"."file_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `sales_resource_category_idx` ON `sales_resource` (`category`);--> statement-breakpoint
CREATE TABLE `sales_resource_file` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `sales_resource`(`id`) ON UPDATE no action ON DELETE restrict
);
