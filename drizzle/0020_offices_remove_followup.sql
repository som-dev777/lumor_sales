CREATE TABLE `company_office` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`country` text,
	`address` text,
	`is_main` integer DEFAULT false NOT NULL,
	`owner_id` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `company_office_company_idx` ON `company_office` (`company_id`);--> statement-breakpoint
CREATE INDEX `company_office_owner_idx` ON `company_office` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_office_name_unique` ON `company_office` (`company_id`,lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX `company_office_one_main` ON `company_office` (`company_id`) WHERE "company_office"."is_main" = 1;--> statement-breakpoint
ALTER TABLE `person` ADD `office_id` text REFERENCES company_office(id);--> statement-breakpoint
ALTER TABLE `person` ADD `follow_up_removed_at` integer;--> statement-breakpoint
CREATE INDEX `person_office_idx` ON `person` (`office_id`);