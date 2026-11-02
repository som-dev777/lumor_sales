CREATE TABLE `ai_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`person_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ai_chat_person_user_idx` ON `ai_chat` (`person_id`,`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`drafts` text DEFAULT '[]' NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`reply_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `ai_chat`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ai_chat_message_role_check" CHECK("role" IN ('rep', 'ai'))
);
--> statement-breakpoint
CREATE INDEX `ai_chat_message_chat_idx` ON `ai_chat_message` (`chat_id`,`created_at`);