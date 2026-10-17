CREATE TABLE `login_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`succeeded` integer NOT NULL,
	`occurred_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempt_email_idx` ON `login_attempt` (`email`,`occurred_at`);