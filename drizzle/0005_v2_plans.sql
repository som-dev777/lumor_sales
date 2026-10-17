CREATE TABLE `plan` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`name` text NOT NULL,
	`plan_type` text NOT NULL,
	`persona_id` text,
	`type` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`proposal_status` text DEFAULT 'None' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`skip_weekends` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`persona_id`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plan_type_check" CHECK("type" IN ('Official', 'Personal')),
	CONSTRAINT "plan_plan_type_check" CHECK("plan_type" IN ('Outreach', 'Meeting follow-up', 'Trial', 'Onboarding')),
	CONSTRAINT "plan_status_check" CHECK("status" IN ('Active', 'Archived')),
	CONSTRAINT "plan_proposal_status_check" CHECK("proposal_status" IN ('None', 'Proposed', 'Approved', 'Rejected')),
	CONSTRAINT "plan_skip_weekends_check" CHECK("plan"."skip_weekends" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `plan_owner_idx` ON `plan` (`owner_id`);--> statement-breakpoint
CREATE TABLE `plan_enrolment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`person_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`current_step` integer DEFAULT 1 NOT NULL,
	`next_due_date` text,
	`waiting_for_acceptance` integer DEFAULT false NOT NULL,
	`request_sent_date` text,
	`accepted_date` text,
	`ends_by` text,
	`call_attempts` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`paused_at` integer,
	`ended_at` integer,
	`end_reason` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plan_enrolment_status_check" CHECK("status" IN ('Active', 'Paused', 'Completed', 'Stopped')),
	CONSTRAINT "plan_enrolment_waiting_check" CHECK("plan_enrolment"."waiting_for_acceptance" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_enrolment_one_live` ON `plan_enrolment` (`person_id`) WHERE "plan_enrolment"."status" IN ('Active', 'Paused');--> statement-breakpoint
CREATE INDEX `plan_enrolment_plan_idx` ON `plan_enrolment` (`plan_id`);--> statement-breakpoint
CREATE INDEX `plan_enrolment_due_idx` ON `plan_enrolment` (`next_due_date`);--> statement-breakpoint
CREATE TABLE `plan_step` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`step_order` integer NOT NULL,
	`channels` text NOT NULL,
	`template_purpose` text,
	`template_id` text,
	`script` text,
	`wait_days` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plan_step_purpose_check" CHECK("template_purpose" IS NULL OR "template_purpose" IN ('Message 1', 'Follow-up 1', 'Follow-up 2', 'Break-up', 'Reply – interested', 'Reply – details', 'Reply – not now', 'Reply – competitor', 'Post-demo recap', 'InMail')),
	CONSTRAINT "plan_step_wait_check" CHECK("plan_step"."wait_days" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_step_unique` ON `plan_step` (`plan_id`,`version`,`step_order`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_proposal` (
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
	CONSTRAINT "proposal_item_type_check" CHECK("item_type" IN ('Persona', 'AccountFilter', 'Template', 'Plan')),
	CONSTRAINT "proposal_decision_check" CHECK("decision" IN ('Pending', 'Approved', 'Rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_proposal`("id", "created_at", "created_by", "updated_at", "item_type", "item_id", "proposed_by", "proposed_at", "decision", "decided_by", "decided_at", "reviewer_note") SELECT "id", "created_at", "created_by", "updated_at", "item_type", "item_id", "proposed_by", "proposed_at", "decision", "decided_by", "decided_at", "reviewer_note" FROM `proposal`;--> statement-breakpoint
DROP TABLE `proposal`;--> statement-breakpoint
ALTER TABLE `__new_proposal` RENAME TO `proposal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `proposal_decision_idx` ON `proposal` (`decision`);--> statement-breakpoint
CREATE INDEX `proposal_item_idx` ON `proposal` (`item_type`,`item_id`);--> statement-breakpoint
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
	`sequence_step` text DEFAULT 'Not started' NOT NULL,
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
	CONSTRAINT "person_sequence_step_check" CHECK("sequence_step" IN ('Not started', 'Warm-up', 'Request sent', 'Message 1', 'Follow-up 1', 'Follow-up 2', 'Break-up', 'Nurture', 'Stopped (replied)')),
	CONSTRAINT "person_opener_version_check" CHECK("opener_template_version" IS NULL OR "opener_template_version" IN ('A', 'B', 'C')),
	CONSTRAINT "person_lost_reason_check" CHECK("lost_reason" IS NULL OR "lost_reason" IN ('No budget', 'Using competitor', 'Not a priority', 'No response', 'Wrong person', 'Other')),
	CONSTRAINT "person_lost_needs_reason" CHECK("__new_person"."stage" <> 'Lost' OR "__new_person"."lost_reason" IS NOT NULL),
	CONSTRAINT "person_converted_check" CHECK("__new_person"."converted" IN (0, 1)),
	CONSTRAINT "person_seniority_check" CHECK("seniority" IS NULL OR "seniority" IN ('Entry Level', 'Senior', 'Entry Level Manager', 'Experienced Manager', 'Director', 'Vice President', 'CXO', 'Owner / Partner')),
	CONSTRAINT "person_dnc_check" CHECK("__new_person"."do_not_contact" IN (0, 1))
);
--> statement-breakpoint
-- v1 → v2 stages, exactly as the PRD table says (D-029). New columns take their defaults.
INSERT INTO `__new_person`("id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", "stage", "sequence_step", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes") SELECT "id", "created_at", "created_by", "updated_at", "full_name", "title", "linkedin_url", "linkedin_url_normalised", "sales_nav_url", "company_id", "persona_id", "level", "account_filter_id", "market", "owner_id", CASE "stage"
  WHEN 'Request sent' THEN 'Contacted'
  WHEN 'Messaged' THEN 'Connected'
  WHEN 'Demo booked' THEN 'Meeting scheduled'
  WHEN 'Demo done' THEN 'Meeting done'
  WHEN 'Trial/Pilot' THEN 'Trial'
  ELSE "stage" END, "sequence_step", "opener_template_id", "opener_template_version", "next_action", "next_action_date", "snoozed_until", "lost_reason", "converted", "converted_date", "notes" FROM `person`;--> statement-breakpoint
DROP TABLE `person`;--> statement-breakpoint
ALTER TABLE `__new_person` RENAME TO `person`;--> statement-breakpoint
CREATE UNIQUE INDEX `person_linkedin_url_normalised_unique` ON `person` (`linkedin_url_normalised`);--> statement-breakpoint
CREATE INDEX `person_owner_idx` ON `person` (`owner_id`);--> statement-breakpoint
CREATE INDEX `person_stage_idx` ON `person` (`stage`);--> statement-breakpoint
CREATE INDEX `person_next_action_date_idx` ON `person` (`next_action_date`);--> statement-breakpoint
CREATE INDEX `person_company_idx` ON `person` (`company_id`);--> statement-breakpoint
CREATE INDEX `person_persona_idx` ON `person` (`persona_id`);--> statement-breakpoint
CREATE TABLE `__new_activity` (
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
	`call_outcome` text,
	`plan_enrolment_id` text,
	`plan_step_order` integer,
	`to_stage` text,
	`request_note` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `template`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "activity_type_check" CHECK("type" IN ('Profile viewed', 'Post engaged', 'Request sent', 'Request accepted', 'Request withdrawn', 'Message sent', 'Reply received', 'InMail sent', 'Meeting booked', 'Meeting held', 'Meeting note', 'Stage change', 'Deal update', 'Call', 'Task done', 'Plan change')),
	CONSTRAINT "activity_channel_check" CHECK("channel" IN ('LinkedIn', 'InMail', 'Email', 'Call', 'WhatsApp', 'In person')),
	CONSTRAINT "activity_reply_type_check" CHECK("reply_type" IS NULL OR "reply_type" IN ('Interested', 'Asking for details', 'Not now', 'Objection', 'Using a competitor', 'Not interested')),
	CONSTRAINT "activity_reply_type_only_on_reply" CHECK("__new_activity"."reply_type" IS NULL OR "__new_activity"."type" = 'Reply received'),
	CONSTRAINT "activity_template_version_check" CHECK("template_version" IS NULL OR "template_version" IN ('A', 'B', 'C')),
	CONSTRAINT "activity_edit_level_check" CHECK("edit_level" IS NULL OR "edit_level" IN ('None', 'Light', 'Heavy')),
	CONSTRAINT "activity_ai_suggestion_used_check" CHECK("__new_activity"."ai_suggestion_used" IN (0, 1)),
	CONSTRAINT "activity_call_outcome_check" CHECK("call_outcome" IS NULL OR "call_outcome" IN ('Connected', 'No answer', 'Call back later', 'Wrong number', 'Not interested')),
	CONSTRAINT "activity_to_stage_check" CHECK("to_stage" IS NULL OR "to_stage" IN ('Prospect', 'Contacted', 'Connected', 'Replied', 'Meeting scheduled', 'Meeting done', 'Proposal sent', 'Trial', 'Paid', 'Active customer', 'Lost')),
	CONSTRAINT "activity_request_note_check" CHECK("__new_activity"."request_note" IN (0, 1))
);
--> statement-breakpoint
-- Demo booked/held → Meeting booked/held; past stage changes get to_stage (D-029).
INSERT INTO `__new_activity`("id", "created_at", "created_by", "updated_at", "person_id", "company_id", "user_id", "occurred_at", "type", "channel", "content", "reply_type", "template_id", "template_version", "ai_suggestion_used", "suggestion_approach", "edit_level", "to_stage") SELECT "id", "created_at", "created_by", "updated_at", "person_id", "company_id", "user_id", "occurred_at", CASE "type"
  WHEN 'Demo booked' THEN 'Meeting booked'
  WHEN 'Demo held' THEN 'Meeting held'
  ELSE "type" END, "channel", "content", "reply_type", "template_id", "template_version", "ai_suggestion_used", "suggestion_approach", "edit_level", CASE WHEN "type" = 'Stage change' THEN CASE
  WHEN "content" LIKE '%→ Trial/Pilot%' THEN 'Trial'
  WHEN "content" LIKE '%→ Demo done%' THEN 'Meeting done'
  WHEN "content" LIKE '%→ Demo booked%' THEN 'Meeting scheduled'
  WHEN "content" LIKE '%→ Request sent%' THEN 'Contacted'
  WHEN "content" LIKE '%→ Messaged%' THEN 'Connected'
  WHEN "content" LIKE '%→ Connected%' THEN 'Connected'
  WHEN "content" LIKE '%→ Replied%' THEN 'Replied'
  WHEN "content" LIKE '%→ Paid%' THEN 'Paid'
  WHEN "content" LIKE '%→ Lost%' THEN 'Lost'
  WHEN "content" LIKE '%→ Prospect%' THEN 'Prospect'
  END END FROM `activity`;--> statement-breakpoint
DROP TABLE `activity`;--> statement-breakpoint
ALTER TABLE `__new_activity` RENAME TO `activity`;--> statement-breakpoint
CREATE INDEX `activity_person_time_idx` ON `activity` (`person_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_user_time_idx` ON `activity` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_type_time_idx` ON `activity` (`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_enrolment_idx` ON `activity` (`plan_enrolment_id`);--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `msg_after_accept_min_days` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `msg_after_accept_max_days` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `min_gap_days` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `max_follow_ups` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `weekly_touch_limit` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `outreach_max_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `outreach_max_days_senior` integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `nurture_days` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `reply_deadline_min_days` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `playbook_settings` ADD `reply_deadline_max_days` integer DEFAULT 10 NOT NULL;