ALTER TABLE `report_run` ADD `hidden_sections` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `report_run` ADD `edits` text DEFAULT '{}' NOT NULL;