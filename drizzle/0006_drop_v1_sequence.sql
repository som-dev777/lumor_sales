PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_person` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`full_name` text NOT NULL,
	`title` text,
	`linkedin_url` text NOT NULL,
	`linkedin_url_normalised` text NOT NULL,
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
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`persona_id`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_filter_id`) REFERENCES `account_filter`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opener_template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "person_linkedin_url_check" CHECK("__new_person"."linkedin_url" LIKE '%linkedin.com/in/%'),
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
INSERT INTO `__new_person`("id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", "stage", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes", "phone", "email", "seniority", "do_not_contact", "dnc_reason", "dnc_date", "nurture_until", "awaiting_reply_until") SELECT "id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", "stage", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes", "phone", "email", "seniority", "do_not_contact", "dnc_reason", "dnc_date", "nurture_until", "awaiting_reply_until" FROM `person`;--> statement-breakpoint
DROP TABLE `person`;--> statement-breakpoint
ALTER TABLE `__new_person` RENAME TO `person`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `person_linkedin_url_normalised_unique` ON `person` (`linkedin_url_normalised`);--> statement-breakpoint
CREATE INDEX `person_owner_idx` ON `person` (`owner_id`);--> statement-breakpoint
CREATE INDEX `person_stage_idx` ON `person` (`stage`);--> statement-breakpoint
CREATE INDEX `person_next_action_date_idx` ON `person` (`next_action_date`);--> statement-breakpoint
CREATE INDEX `person_company_idx` ON `person` (`company_id`);--> statement-breakpoint
CREATE INDEX `person_persona_idx` ON `person` (`persona_id`);--> statement-breakpoint
CREATE TABLE `__new_playbook_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`withdraw_after_days` integer DEFAULT 14 NOT NULL,
	`daily_connection_target` integer DEFAULT 20 NOT NULL,
	`daily_message_target` integer DEFAULT 10 NOT NULL,
	`stale_lead_days` integer DEFAULT 21 NOT NULL,
	`msg_after_accept_min_days` integer DEFAULT 1 NOT NULL,
	`msg_after_accept_max_days` integer DEFAULT 3 NOT NULL,
	`min_gap_days` integer DEFAULT 3 NOT NULL,
	`max_follow_ups` integer DEFAULT 4 NOT NULL,
	`weekly_touch_limit` integer DEFAULT 2 NOT NULL,
	`outreach_max_days` integer DEFAULT 30 NOT NULL,
	`outreach_max_days_senior` integer DEFAULT 45 NOT NULL,
	`nurture_days` integer DEFAULT 60 NOT NULL,
	`reply_deadline_min_days` integer DEFAULT 1 NOT NULL,
	`reply_deadline_max_days` integer DEFAULT 10 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "playbook_settings_single_row" CHECK("__new_playbook_settings"."id" = 1),
	CONSTRAINT "playbook_settings_positive" CHECK("__new_playbook_settings"."withdraw_after_days" >= 0 AND "__new_playbook_settings"."daily_connection_target" >= 0 AND "__new_playbook_settings"."daily_message_target" >= 0 AND "__new_playbook_settings"."stale_lead_days" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_playbook_settings`("id", "created_at", "created_by", "updated_at", "withdraw_after_days", "daily_connection_target", "daily_message_target", "stale_lead_days", "msg_after_accept_min_days", "msg_after_accept_max_days", "min_gap_days", "max_follow_ups", "weekly_touch_limit", "outreach_max_days", "outreach_max_days_senior", "nurture_days", "reply_deadline_min_days", "reply_deadline_max_days") SELECT "id", "created_at", "created_by", "updated_at", "withdraw_after_days", "daily_connection_target", "daily_message_target", "stale_lead_days", "msg_after_accept_min_days", "msg_after_accept_max_days", "min_gap_days", "max_follow_ups", "weekly_touch_limit", "outreach_max_days", "outreach_max_days_senior", "nurture_days", "reply_deadline_min_days", "reply_deadline_max_days" FROM `playbook_settings`;--> statement-breakpoint
DROP TABLE `playbook_settings`;--> statement-breakpoint
ALTER TABLE `__new_playbook_settings` RENAME TO `playbook_settings`;