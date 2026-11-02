CREATE TABLE `calendly_booking` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`invitee_uri` text NOT NULL,
	`event_uri` text,
	`event_name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`join_url` text,
	`invitee_name` text NOT NULL,
	`invitee_email` text NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'Booked' NOT NULL,
	`cancel_reason` text,
	`person_id` text,
	`replaces_uri` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "calendly_booking_status_check" CHECK("status" IN ('Booked', 'Cancelled', 'Moved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendly_booking_invitee_uri_unique` ON `calendly_booking` (`invitee_uri`);--> statement-breakpoint
CREATE INDEX `calendly_booking_person_idx` ON `calendly_booking` (`person_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_person` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`full_name` text NOT NULL,
	`title` text,
	`linkedin_url` text,
	`linkedin_url_normalised` text,
	`sales_nav_url` text,
	`company_id` text,
	`persona_id` text,
	`level` text,
	`account_filter_id` text,
	`market` text,
	`owner_id` text NOT NULL,
	`stage` text DEFAULT 'Prospect' NOT NULL,
	`opener_template_id` text,
	`opener_template_version` text,
	`next_action` text,
	`next_action_date` text,
	`snoozed_until` text,
	`lost_reason` text,
	`converted` integer DEFAULT false NOT NULL,
	`converted_date` text,
	`notes` text,
	`phone` text,
	`email` text,
	`seniority` text,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`dnc_reason` text,
	`dnc_date` text,
	`nurture_until` text,
	`awaiting_reply_until` text,
	`nudge_count` integer DEFAULT 0 NOT NULL,
	`review_note` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`persona_id`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_filter_id`) REFERENCES `account_filter`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opener_template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "person_linkedin_url_check" CHECK("__new_person"."linkedin_url" IS NULL OR "__new_person"."linkedin_url" LIKE '%linkedin.com/in/%'),
	CONSTRAINT "person_contact_check" CHECK("__new_person"."linkedin_url" IS NOT NULL OR "__new_person"."email" IS NOT NULL),
	CONSTRAINT "person_level_check" CHECK("level" IS NULL OR "level" IN ('Leader', 'Practitioner')),
	CONSTRAINT "person_stage_check" CHECK("stage" IN ('Prospect', 'Contacted', 'Connected', 'Replied', 'Meeting scheduled', 'Meeting done', 'Proposal sent', 'Trial', 'Paid', 'Active customer', 'Lost')),
	CONSTRAINT "person_opener_version_check" CHECK("opener_template_version" IS NULL OR "opener_template_version" IN ('A', 'B', 'C')),
	CONSTRAINT "person_lost_reason_check" CHECK("lost_reason" IS NULL OR "lost_reason" IN ('No budget', 'Using competitor', 'Not a priority', 'No response', 'Wrong person', 'Other')),
	CONSTRAINT "person_lost_needs_reason" CHECK("__new_person"."stage" <> 'Lost' OR "__new_person"."lost_reason" IS NOT NULL),
	CONSTRAINT "person_converted_check" CHECK("__new_person"."converted" IN (0, 1)),
	CONSTRAINT "person_seniority_check" CHECK("seniority" IS NULL OR "seniority" IN ('Entry Level', 'Senior', 'Entry Level Manager', 'Experienced Manager', 'Director', 'Vice President', 'CXO', 'Owner / Partner')),
	CONSTRAINT "person_dnc_check" CHECK("__new_person"."do_not_contact" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_person`("id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", "stage", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes", "phone", "email", "seniority", "do_not_contact", "dnc_reason", "dnc_date", "nurture_until", "awaiting_reply_until", "nudge_count") SELECT "id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", "stage", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes", "phone", "email", "seniority", "do_not_contact", "dnc_reason", "dnc_date", "nurture_until", "awaiting_reply_until", "nudge_count" FROM `person`;--> statement-breakpoint
DROP TABLE `person`;--> statement-breakpoint
ALTER TABLE `__new_person` RENAME TO `person`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `person_linkedin_url_normalised_unique` ON `person` (`linkedin_url_normalised`);--> statement-breakpoint
CREATE INDEX `person_email_idx` ON `person` (`email`);--> statement-breakpoint
CREATE INDEX `person_owner_idx` ON `person` (`owner_id`);--> statement-breakpoint
CREATE INDEX `person_stage_idx` ON `person` (`stage`);--> statement-breakpoint
CREATE INDEX `person_next_action_date_idx` ON `person` (`next_action_date`);--> statement-breakpoint
CREATE INDEX `person_company_idx` ON `person` (`company_id`);--> statement-breakpoint
CREATE INDEX `person_persona_idx` ON `person` (`persona_id`);--> statement-breakpoint
CREATE TABLE `__new_notification` (
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
	CONSTRAINT "notification_kind_check" CHECK("kind" IN ('booked', 'cancelled', 'rescheduled', 'added', 'removed', 'google', 'report', 'calendly'))
);
--> statement-breakpoint
INSERT INTO `__new_notification`("id", "created_at", "created_by", "updated_at", "user_id", "kind", "title", "body", "link", "booking_id", "read_at") SELECT "id", "created_at", "created_by", "updated_at", "user_id", "kind", "title", "body", "link", "booking_id", "read_at" FROM `notification`;--> statement-breakpoint
DROP TABLE `notification`;--> statement-breakpoint
ALTER TABLE `__new_notification` RENAME TO `notification`;--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_unread_idx` ON `notification` (`user_id`) WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
ALTER TABLE `plan_step` ADD `custom_purpose` text;--> statement-breakpoint
ALTER TABLE `report_run` ADD `shared_with` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_booking` (
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
	`google_event_id` text,
	`meet_link` text,
	`mode` text DEFAULT 'online' NOT NULL,
	`manage_token_enc` text,
	`reminder_24_at` integer,
	`reminder_1_at` integer,
	`title` text,
	`to_emails` text DEFAULT '[]' NOT NULL,
	`cc_emails` text DEFAULT '[]' NOT NULL,
	`message` text,
	`location` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`meeting_type_id`) REFERENCES `meeting_type`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`host_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "booking_status_check" CHECK("status" IN ('Confirmed', 'Cancelled')),
	CONSTRAINT "booking_mode_check" CHECK("mode" IN ('online', 'in_person')),
	CONSTRAINT "booking_cancelled_by_check" CHECK("cancelled_by" IS NULL OR "cancelled_by" IN ('invitee', 'host')),
	CONSTRAINT "booking_times_check" CHECK("__new_booking"."ends_at" > "__new_booking"."starts_at")
);
--> statement-breakpoint
INSERT INTO `__new_booking`("id", "created_at", "created_by", "updated_at", "meeting_type_id", "host_id", "starts_at", "ends_at", "status", "invitee_name", "invitee_email", "invitee_company", "invitee_phone", "invitee_linkedin", "invitee_note", "answers", "invitee_time_zone", "manage_token_hash", "person_id", "cancelled_at", "cancelled_by", "cancel_reason", "rescheduled_from_id", "google_event_id", "meet_link") SELECT "id", "created_at", "created_by", "updated_at", "meeting_type_id", "host_id", "starts_at", "ends_at", "status", "invitee_name", "invitee_email", "invitee_company", "invitee_phone", "invitee_linkedin", "invitee_note", "answers", "invitee_time_zone", "manage_token_hash", "person_id", "cancelled_at", "cancelled_by", "cancel_reason", "rescheduled_from_id", "google_event_id", "meet_link" FROM `booking`;--> statement-breakpoint
DROP TABLE `booking`;--> statement-breakpoint
ALTER TABLE `__new_booking` RENAME TO `booking`;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_manage_token_hash_unique` ON `booking` (`manage_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_host_start_confirmed_unique` ON `booking` (`host_id`,`starts_at`) WHERE "booking"."status" = 'Confirmed';--> statement-breakpoint
CREATE INDEX `booking_host_starts_idx` ON `booking` (`host_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `booking_person_idx` ON `booking` (`person_id`);--> statement-breakpoint
CREATE INDEX `booking_email_idx` ON `booking` (`invitee_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `calendar_profile` ADD `email_title` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `standard_fields` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `email_name` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `email_note` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `in_person_address` text;--> statement-breakpoint
ALTER TABLE `meeting_type` ADD `hidden` integer DEFAULT false NOT NULL;