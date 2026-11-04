CREATE TABLE `desk_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`person_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`channel` text NOT NULL,
	`task` text,
	`content` text,
	`options` text,
	`tip` text,
	`warning` text,
	`template_id` text,
	`reply_activity_id` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "desk_entry_kind_check" CHECK("kind" IN ('ask', 'draft')),
	CONSTRAINT "desk_entry_channel_check" CHECK("channel" IN ('LinkedIn message', 'LinkedIn connection note', 'LinkedIn InMail', 'Email', 'WhatsApp', 'Call')),
	CONSTRAINT "desk_entry_task_check" CHECK("task" IS NULL OR "task" IN ('first', 'reply', 'next', 'ask'))
);
--> statement-breakpoint
CREATE INDEX `desk_entry_person_idx` ON `desk_entry` (`person_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `user` ADD `job_title` text;--> statement-breakpoint
ALTER TABLE `person` ADD `brief` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `desk_channel` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `from_draft_id` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `option_index` integer;