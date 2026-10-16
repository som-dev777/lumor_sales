-- Database-level locks (docs/data-model.md → Triggers, D-001).
-- These hold no matter what the app code does.

-- F14: the audit log is insert-only, for everyone including Admin.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is insert-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is insert-only');
END;
--> statement-breakpoint

-- F01: users are never deleted, only deactivated.
CREATE TRIGGER `user_no_delete` BEFORE DELETE ON `user`
BEGIN
  SELECT RAISE(ABORT, 'users cannot be deleted; deactivate instead');
END;
--> statement-breakpoint

-- F01: deactivating a user ends every login they have, at once.
CREATE TRIGGER `user_deactivate_kills_sessions` AFTER UPDATE OF `active` ON `user`
WHEN NEW.`active` = 0
BEGIN
  DELETE FROM `session` WHERE `user_id` = NEW.`id`;
END;
--> statement-breakpoint

-- F12, F13: the two single-row settings tables always have their row.
INSERT INTO `playbook_settings` (`id`) VALUES (1);
--> statement-breakpoint
INSERT INTO `product_facts` (`id`) VALUES (1);
