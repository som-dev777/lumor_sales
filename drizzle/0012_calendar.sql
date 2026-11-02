CREATE TABLE `booking` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`meeting_type_id` text NOT NULL,
	`host_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'Confirmed' NOT NULL,
	`invitee_name` text NOT NULL,
	`invitee_email` text NOT NULL,
	`invitee_company` text NOT NULL,
	`invitee_phone` text,
	`invitee_linkedin` text,
	`invitee_note` text,
	`answers` text DEFAULT '[]' NOT NULL,
	`invitee_time_zone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`manage_token_hash` text NOT NULL,
	`person_id` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`cancel_reason` text,
	`rescheduled_from_id` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`meeting_type_id`) REFERENCES `meeting_type`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`host_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "booking_status_check" CHECK("status" IN ('Confirmed', 'Cancelled')),
	CONSTRAINT "booking_cancelled_by_check" CHECK("cancelled_by" IS NULL OR "cancelled_by" IN ('invitee', 'host')),
	CONSTRAINT "booking_times_check" CHECK("booking"."ends_at" > "booking"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_manage_token_hash_unique` ON `booking` (`manage_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_host_start_confirmed_unique` ON `booking` (`host_id`,`starts_at`) WHERE "booking"."status" = 'Confirmed';--> statement-breakpoint
CREATE INDEX `booking_host_starts_idx` ON `booking` (`host_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `booking_person_idx` ON `booking` (`person_id`);--> statement-breakpoint
CREATE INDEX `booking_email_idx` ON `booking` (`invitee_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `calendar_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`weekly_hours` text NOT NULL,
	`days_off` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "calendar_profile_slug_check" CHECK("calendar_profile"."slug" GLOB '[a-z0-9]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_profile_user_id_unique` ON `calendar_profile` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_profile_slug_unique` ON `calendar_profile` (`slug`);--> statement-breakpoint
CREATE TABLE `meeting_type` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`duration_min` integer NOT NULL,
	`description` text,
	`location` text,
	`buffer_min` integer DEFAULT 0 NOT NULL,
	`min_notice_hours` integer DEFAULT 4 NOT NULL,
	`max_days_ahead` integer DEFAULT 30 NOT NULL,
	`max_per_day` integer,
	`questions` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "meeting_type_duration_check" CHECK("meeting_type"."duration_min" BETWEEN 5 AND 240),
	CONSTRAINT "meeting_type_active_check" CHECK("meeting_type"."active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_type_owner_slug_unique` ON `meeting_type` (`owner_id`,`slug`);