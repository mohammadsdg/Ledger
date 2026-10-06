CREATE DATABASE IF NOT EXISTS ledger CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ledger;

CREATE TABLE IF NOT EXISTS lists (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id), KEY lists_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) NOT NULL,
  list_id VARCHAR(36) NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  today BOOLEAN NOT NULL DEFAULT FALSE,
  my_day DATE NULL,
  important BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_at BIGINT UNSIGNED NULL,
  reminder_sent_at BIGINT UNSIGNED NULL,
  due_date DATE NULL,
  repeat_rule VARCHAR(32) NULL,
  note TEXT NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id), KEY tasks_list_id (list_id), KEY tasks_my_day (my_day), KEY tasks_important (important),
  KEY tasks_due_date (due_date), KEY tasks_updated_at (updated_at),
  CONSTRAINT tasks_list_fk FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Keep this file usable as both a fresh install and an in-place upgrade.
-- MySQL's CREATE TABLE IF NOT EXISTS does not add new columns to an existing
-- table, so the procedure below adds only the pieces that are missing.
DROP PROCEDURE IF EXISTS ledger_apply_schema;
DELIMITER //
CREATE PROCEDURE ledger_apply_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'my_day'
  ) THEN
    ALTER TABLE tasks ADD COLUMN my_day DATE NULL AFTER today;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'important'
  ) THEN
    ALTER TABLE tasks ADD COLUMN important BOOLEAN NOT NULL DEFAULT FALSE AFTER my_day;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'reminder_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN reminder_at BIGINT UNSIGNED NULL AFTER important;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'reminder_sent_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN reminder_sent_at BIGINT UNSIGNED NULL AFTER reminder_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'due_date'
  ) THEN
    ALTER TABLE tasks ADD COLUMN due_date DATE NULL AFTER reminder_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'repeat_rule'
  ) THEN
    ALTER TABLE tasks ADD COLUMN repeat_rule VARCHAR(32) NULL AFTER due_date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'note'
  ) THEN
    ALTER TABLE tasks ADD COLUMN note TEXT NULL AFTER repeat_rule;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'tasks_my_day'
  ) THEN
    ALTER TABLE tasks ADD KEY tasks_my_day (my_day);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'tasks_important'
  ) THEN
    ALTER TABLE tasks ADD KEY tasks_important (important);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'tasks_due_date'
  ) THEN
    ALTER TABLE tasks ADD KEY tasks_due_date (due_date);
  END IF;

  UPDATE tasks SET my_day = CURRENT_DATE WHERE today = TRUE AND my_day IS NULL;
  UPDATE tasks SET note = '' WHERE note IS NULL;
  ALTER TABLE tasks MODIFY COLUMN note TEXT NOT NULL;
END//
DELIMITER ;

CALL ledger_apply_schema();
DROP PROCEDURE ledger_apply_schema;

CREATE TABLE IF NOT EXISTS steps (
  id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id), KEY steps_task_id (task_id),
  CONSTRAINT steps_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deletions (
  entity_type ENUM('list','task') NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  deleted_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (entity_type,entity_id), KEY deletions_deleted_at (deleted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL,
  setting_value TEXT NOT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

INSERT INTO lists (id,name,created_at,updated_at)
VALUES ('all','Tasks',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE id=id;
