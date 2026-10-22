ALTER TABLE `person` ADD `nudge_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`direction` text,
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
	CONSTRAINT "activity_request_note_check" CHECK("__new_activity"."request_note" IN (0, 1)),
	CONSTRAINT "activity_direction_check" CHECK("direction" IS NULL OR "direction" IN ('out', 'in'))
);
--> statement-breakpoint
INSERT INTO `__new_activity`("id", "created_at", "created_by", "updated_at", "person_id", "company_id", "user_id", "occurred_at", "type", "channel", "content", "reply_type", "template_id", "template_version", "ai_suggestion_used", "suggestion_approach", "edit_level", "call_outcome", "plan_enrolment_id", "plan_step_order", "to_stage", "request_note", "direction") SELECT "id", "created_at", "created_by", "updated_at", "person_id", "company_id", "user_id", "occurred_at", "type", "channel", "content", "reply_type", "template_id", "template_version", "ai_suggestion_used", "suggestion_approach", "edit_level", "call_outcome", "plan_enrolment_id", "plan_step_order", "to_stage", "request_note", CASE WHEN "type" IN ('Message sent', 'InMail sent', 'Call') THEN 'out' WHEN "type" = 'Reply received' THEN 'in' ELSE NULL END FROM `activity`;--> statement-breakpoint
DROP TABLE `activity`;--> statement-breakpoint
ALTER TABLE `__new_activity` RENAME TO `activity`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `activity_person_time_idx` ON `activity` (`person_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_user_time_idx` ON `activity` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_type_time_idx` ON `activity` (`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_enrolment_idx` ON `activity` (`plan_enrolment_id`);