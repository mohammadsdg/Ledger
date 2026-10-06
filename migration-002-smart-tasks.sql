USE ledger;

ALTER TABLE tasks
  ADD COLUMN my_day DATE NULL AFTER today,
  ADD COLUMN important BOOLEAN NOT NULL DEFAULT FALSE AFTER my_day,
  ADD COLUMN reminder_at BIGINT UNSIGNED NULL AFTER important,
  ADD COLUMN due_date DATE NULL AFTER reminder_at,
  ADD COLUMN repeat_rule VARCHAR(32) NULL AFTER due_date,
  ADD COLUMN note TEXT NULL AFTER repeat_rule,
  ADD KEY tasks_my_day (my_day),
  ADD KEY tasks_important (important),
  ADD KEY tasks_due_date (due_date);

UPDATE tasks SET my_day = CURRENT_DATE WHERE today = TRUE;
UPDATE tasks SET note = '' WHERE note IS NULL;
ALTER TABLE tasks MODIFY COLUMN note TEXT NOT NULL;

CREATE TABLE steps (
  id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id), KEY steps_task_id (task_id),
  CONSTRAINT steps_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO lists (id,name,created_at,updated_at)
VALUES ('all','Tasks',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE id=id;
