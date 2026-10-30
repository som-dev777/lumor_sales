CREATE TABLE `report_run` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`scope` text NOT NULL,
	`person_user_id` text,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`ai_summary` text,
	`generated_by` text,
	`schedule_id` text,
	`emailed_to` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`generated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`schedule_id`) REFERENCES `report_schedule`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "report_run_scope_check" CHECK("scope" IS NULL OR "scope" IN ('team', 'person')),
	CONSTRAINT "report_run_person_check" CHECK("report_run"."scope" <> 'person' OR "report_run"."person_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `report_run_created_idx` ON `report_run` (`created_at`);--> statement-breakpoint
CREATE INDEX `report_run_person_idx` ON `report_run` (`person_user_id`);--> statement-breakpoint
CREATE TABLE `report_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`name` text NOT NULL,
	`frequency` text NOT NULL,
	`time_of_day` text NOT NULL,
	`day` integer,
	`scope` text NOT NULL,
	`person_user_id` text,
	`recipients` text NOT NULL,
	`emails` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "report_schedule_frequency_check" CHECK("frequency" IN ('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-yearly', 'Yearly')),
	CONSTRAINT "report_schedule_scope_check" CHECK("scope" IN ('team', 'person', 'each-rep')),
	CONSTRAINT "report_schedule_recipients_check" CHECK("recipients" IN ('admins', 'emails', 'each-rep')),
	CONSTRAINT "report_schedule_active_check" CHECK("report_schedule"."active" IN (0, 1)),
	CONSTRAINT "report_schedule_person_check" CHECK("report_schedule"."scope" <> 'person' OR "report_schedule"."person_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_schedule_name_unique` ON `report_schedule` (`name`);--> statement-breakpoint
CREATE INDEX `report_schedule_due_idx` ON `report_schedule` (`active`,`next_run_at`);--> statement-breakpoint
ALTER TABLE `activity` ADD `plan_due_date` text;