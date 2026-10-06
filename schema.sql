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
  due_date DATE NULL,
  repeat_rule VARCHAR(32) NULL,
  note TEXT NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id), KEY tasks_list_id (list_id), KEY tasks_my_day (my_day), KEY tasks_important (important),
  KEY tasks_due_date (due_date), KEY tasks_updated_at (updated_at),
  CONSTRAINT tasks_list_fk FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

INSERT INTO lists (id,name,created_at,updated_at)
VALUES ('all','Tasks',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE id=id;
