CREATE TABLE `linkedin_email` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`gmail_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_name` text,
	`subject` text NOT NULL,
	`received_at` integer NOT NULL,
	`person_id` text,
	`activity_id` text,
	`result` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "linkedin_email_kind_check" CHECK("kind" IN ('Accepted', 'Message', 'Other')),
	CONSTRAINT "linkedin_email_result_check" CHECK("result" IN ('Logged', 'Already logged', 'Not matched', 'Skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_email_user_gmail_idx` ON `linkedin_email` (`user_id`,`gmail_id`);--> statement-breakpoint
CREATE INDEX `linkedin_email_user_received_idx` ON `linkedin_email` (`user_id`,`received_at`);