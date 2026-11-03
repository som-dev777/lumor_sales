ALTER TABLE `meeting_type` ADD `deleted_at` integer;--> statement-breakpoint
-- No gaps between meetings any more (D-048).
UPDATE `meeting_type` SET `buffer_min` = 0;
