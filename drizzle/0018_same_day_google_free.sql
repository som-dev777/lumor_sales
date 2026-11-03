-- D-051: same-day booking, and Google Calendar busy times no longer hide booking times.
-- (The column defaults change in the app; every insert sets these values itself.)
UPDATE `meeting_type` SET `min_notice_hours` = 0;--> statement-breakpoint
UPDATE `calendar_profile` SET `use_google_busy` = 0;
