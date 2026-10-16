CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'User' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "user_role_check" CHECK("role" IN ('Admin', 'User')),
	CONSTRAINT "user_active_check" CHECK("user"."active" IN (0, 1)),
	CONSTRAINT "user_must_change_password_check" CHECK("user"."must_change_password" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'User' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invite_role_check" CHECK("role" IN ('Admin', 'User'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_hash_unique` ON `invite` (`token_hash`);--> statement-breakpoint
CREATE TABLE `persona` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`owner_id` text NOT NULL,
	`functions` text DEFAULT '[]' NOT NULL,
	`seniority` text DEFAULT '[]' NOT NULL,
	`job_titles` text DEFAULT '[]' NOT NULL,
	`geography` text DEFAULT '["India"]' NOT NULL,
	`tier` integer NOT NULL,
	`who_it_covers` text,
	`tools_used_today` text,
	`lead_with_angle` text,
	`notes` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`proposal_status` text DEFAULT 'None' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "persona_type_check" CHECK("type" IN ('Official', 'Personal')),
	CONSTRAINT "persona_tier_check" CHECK("tier" IN (1, 2, 3)),
	CONSTRAINT "persona_status_check" CHECK("status" IN ('Active', 'Archived')),
	CONSTRAINT "persona_proposal_status_check" CHECK("proposal_status" IN ('None', 'Proposed', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE INDEX `persona_owner_idx` ON `persona` (`owner_id`);--> statement-breakpoint
CREATE TABLE `account_filter` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`owner_id` text NOT NULL,
	`industries` text DEFAULT '[]' NOT NULL,
	`company_headcount` text,
	`hq_locations` text DEFAULT '[]' NOT NULL,
	`key_filters` text,
	`exclusions` text,
	`keywords` text,
	`why_it_matters` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`proposal_status` text DEFAULT 'None' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "account_filter_type_check" CHECK("type" IN ('Official', 'Personal')),
	CONSTRAINT "account_filter_status_check" CHECK("status" IN ('Active', 'Archived')),
	CONSTRAINT "account_filter_proposal_status_check" CHECK("proposal_status" IN ('None', 'Proposed', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_filter_official_code_unique` ON `account_filter` (`code`) WHERE "account_filter"."type" = 'Official';--> statement-breakpoint
CREATE INDEX `account_filter_owner_idx` ON `account_filter` (`owner_id`);--> statement-breakpoint
CREATE TABLE `template` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`persona_id` text,
	`level` text DEFAULT 'Any' NOT NULL,
	`version` text DEFAULT 'A' NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`proposal_status` text DEFAULT 'None' NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`persona_id`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "template_type_check" CHECK("type" IN ('Official', 'Personal')),
	CONSTRAINT "template_purpose_check" CHECK("purpose" IN ('Message 1', 'Follow-up 1', 'Follow-up 2', 'Break-up', 'Reply – interested', 'Reply – details', 'Reply – not now', 'Reply – competitor', 'Post-demo recap', 'InMail')),
	CONSTRAINT "template_level_check" CHECK("level" IN ('Leader', 'Practitioner', 'Any')),
	CONSTRAINT "template_version_check" CHECK("version" IN ('A', 'B', 'C')),
	CONSTRAINT "template_status_check" CHECK("status" IN ('Active', 'Archived')),
	CONSTRAINT "template_proposal_status_check" CHECK("proposal_status" IN ('None', 'Proposed', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE INDEX `template_owner_idx` ON `template` (`owner_id`);--> statement-breakpoint
CREATE INDEX `template_purpose_idx` ON `template` (`purpose`);--> statement-breakpoint
CREATE TABLE `template_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`template_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_revision_unique` ON `template_revision` (`template_id`,`revision`);--> statement-breakpoint
CREATE TABLE `proposal` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`proposed_by` text NOT NULL,
	`proposed_at` integer NOT NULL,
	`decision` text DEFAULT 'Pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`reviewer_note` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proposal_item_type_check" CHECK("item_type" IN ('Persona', 'AccountFilter', 'Template')),
	CONSTRAINT "proposal_decision_check" CHECK("decision" IN ('Pending', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE INDEX `proposal_decision_idx` ON `proposal` (`decision`);--> statement-breakpoint
CREATE INDEX `proposal_item_idx` ON `proposal` (`item_type`,`item_id`);--> statement-breakpoint
CREATE TABLE `company` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`linkedin_url` text,
	`industry` text,
	`headcount_band` text,
	`city` text,
	`country` text,
	`account_filter_id` text,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'Target' NOT NULL,
	`plan_tier` text,
	`deal_value_inr` integer,
	`customer_start_date` text,
	`notes` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_filter_id`) REFERENCES `account_filter`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "company_status_check" CHECK("status" IN ('Target', 'Engaged', 'Customer', 'Lost'))
);
--> statement-breakpoint
CREATE INDEX `company_owner_idx` ON `company` (`owner_id`);--> statement-breakpoint
CREATE INDEX `company_status_idx` ON `company` (`status`);--> statement-breakpoint
CREATE TABLE `person` (
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
	`sequence_step` text DEFAULT 'Not started' NOT NULL,
	`opener_template_id` text,
	`opener_template_version` text,
	`next_action` text,
	`next_action_date` text,
	`lost_reason` text,
	`converted` integer DEFAULT false NOT NULL,
	`converted_date` text,
	`notes` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`persona_id`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_filter_id`) REFERENCES `account_filter`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opener_template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "person_linkedin_url_check" CHECK("person"."linkedin_url" LIKE '%linkedin.com/in/%'),
	CONSTRAINT "person_level_check" CHECK("level" IS NULL OR "level" IN ('Leader', 'Practitioner')),
	CONSTRAINT "person_stage_check" CHECK("stage" IN ('Prospect', 'Request sent', 'Connected', 'Messaged', 'Replied', 'Demo booked', 'Demo done', 'Trial/Pilot', 'Paid', 'Lost')),
	CONSTRAINT "person_sequence_step_check" CHECK("sequence_step" IN ('Not started', 'Warm-up', 'Request sent', 'Message 1', 'Follow-up 1', 'Follow-up 2', 'Break-up', 'Nurture', 'Stopped (replied)')),
	CONSTRAINT "person_opener_version_check" CHECK("opener_template_version" IS NULL OR "opener_template_version" IN ('A', 'B', 'C')),
	CONSTRAINT "person_lost_reason_check" CHECK("lost_reason" IS NULL OR "lost_reason" IN ('No budget', 'Using competitor', 'Not a priority', 'No response', 'Wrong person', 'Other')),
	CONSTRAINT "person_lost_needs_reason" CHECK("person"."stage" <> 'Lost' OR "person"."lost_reason" IS NOT NULL),
	CONSTRAINT "person_converted_check" CHECK("person"."converted" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_linkedin_url_normalised_unique` ON `person` (`linkedin_url_normalised`);--> statement-breakpoint
CREATE INDEX `person_owner_idx` ON `person` (`owner_id`);--> statement-breakpoint
CREATE INDEX `person_stage_idx` ON `person` (`stage`);--> statement-breakpoint
CREATE INDEX `person_next_action_date_idx` ON `person` (`next_action_date`);--> statement-breakpoint
CREATE INDEX `person_company_idx` ON `person` (`company_id`);--> statement-breakpoint
CREATE INDEX `person_persona_idx` ON `person` (`persona_id`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`person_id` text NOT NULL,
	`company_id` text,
	`user_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`type` text NOT NULL,
	`channel` text DEFAULT 'LinkedIn' NOT NULL,
	`content` text,
	`reply_type` text,
	`template_id` text,
	`template_version` text,
	`ai_suggestion_used` integer DEFAULT false NOT NULL,
	`suggestion_approach` text,
	`edit_level` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "activity_type_check" CHECK("type" IN ('Profile viewed', 'Post engaged', 'Request sent', 'Request accepted', 'Request withdrawn', 'Message sent', 'Reply received', 'InMail sent', 'Demo booked', 'Demo held', 'Meeting note', 'Stage change', 'Deal update')),
	CONSTRAINT "activity_channel_check" CHECK("channel" IN ('LinkedIn', 'InMail', 'Email', 'Call', 'In person')),
	CONSTRAINT "activity_reply_type_check" CHECK("reply_type" IS NULL OR "reply_type" IN ('Interested', 'Asking for details', 'Not now', 'Objection', 'Using a competitor', 'Not interested')),
	CONSTRAINT "activity_reply_type_only_on_reply" CHECK("activity"."reply_type" IS NULL OR "activity"."type" = 'Reply received'),
	CONSTRAINT "activity_template_version_check" CHECK("template_version" IS NULL OR "template_version" IN ('A', 'B', 'C')),
	CONSTRAINT "activity_edit_level_check" CHECK("edit_level" IS NULL OR "edit_level" IN ('None', 'Light', 'Heavy')),
	CONSTRAINT "activity_ai_suggestion_used_check" CHECK("activity"."ai_suggestion_used" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `activity_person_time_idx` ON `activity` (`person_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_user_time_idx` ON `activity` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_type_time_idx` ON `activity` (`type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `playbook_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`follow_up_1_delay_days` integer DEFAULT 4 NOT NULL,
	`follow_up_2_delay_days` integer DEFAULT 7 NOT NULL,
	`break_up_delay_days` integer DEFAULT 10 NOT NULL,
	`withdraw_after_days` integer DEFAULT 14 NOT NULL,
	`daily_connection_target` integer DEFAULT 20 NOT NULL,
	`daily_message_target` integer DEFAULT 10 NOT NULL,
	`stale_lead_days` integer DEFAULT 21 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "playbook_settings_single_row" CHECK("playbook_settings"."id" = 1),
	CONSTRAINT "playbook_settings_positive" CHECK("playbook_settings"."follow_up_1_delay_days" >= 0 AND "playbook_settings"."follow_up_2_delay_days" >= 0 AND "playbook_settings"."break_up_delay_days" >= 0 AND "playbook_settings"."withdraw_after_days" >= 0 AND "playbook_settings"."daily_connection_target" >= 0 AND "playbook_settings"."daily_message_target" >= 0 AND "playbook_settings"."stale_lead_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE `product_facts` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`what_lumor_does` text,
	`live_features` text,
	`features_not_live` text,
	`pricing_guidance` text,
	`positioning_rules` text,
	`calendar_link` text,
	`last_edited_by` text,
	`last_edited_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`last_edited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_facts_single_row" CHECK("product_facts"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`occurred_at` integer NOT NULL,
	`user_id` text,
	`entity_type` text NOT NULL,
	`record_name` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`changes` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "audit_log_action_check" CHECK("action" IN ('Created', 'Updated', 'Deleted', 'Approved', 'Rejected', 'Reassigned', 'Role changed', 'Deactivated', 'Reactivated'))
);
--> statement-breakpoint
CREATE INDEX `audit_log_occurred_at_idx` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_record_idx` ON `audit_log` (`entity_type`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_log_user_idx` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_release` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`version` text NOT NULL,
	`release_date` text NOT NULL,
	`summary` text NOT NULL,
	`changes` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_release_version_unique` ON `app_release` (`version`);