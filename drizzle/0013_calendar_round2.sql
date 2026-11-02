CREATE TABLE `booking_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`booking_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_participant_unique` ON `booking_participant` (`booking_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `booking_participant_user_idx` ON `booking_participant` (`user_id`);--> statement-breakpoint
CREATE TABLE `google_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`google_email` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`scope` text NOT NULL,
	`last_error` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_connection_user_id_unique` ON `google_connection` (`user_id`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`booking_id` text,
	`read_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notification_kind_check" CHECK("kind" IN ('booked', 'cancelled', 'rescheduled', 'added', 'removed', 'google'))
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_unread_idx` ON `notification` (`user_id`) WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
ALTER TABLE `booking` ADD `google_event_id` text;--> statement-breakpoint
ALTER TABLE `booking` ADD `meet_link` text;--> statement-breakpoint
ALTER TABLE `calendar_profile` ADD `notify_email` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `google_meet` integer DEFAULT true NOT NULL;