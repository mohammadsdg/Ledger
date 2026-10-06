import test from "node:test";
import assert from "node:assert/strict";
import { isTaskInView } from "../web/src/taskViews.mjs";

const day = "2026-10-06";
const customTask = { listId: "work", myDay: null, important: false, dueDate: null, reminderAt: null };

test("ordinary custom-list tasks stay out of All tasks", () => {
  assert.equal(isTaskInView(customTask, "all", day), false);
  assert.equal(isTaskInView(customTask, "work", day), true);
});

test("tasks created in All tasks remain there", () => {
  assert.equal(isTaskInView({ ...customTask, listId: "all" }, "all", day), true);
});

test("My Day promotion expires after its calendar date", () => {
  const task = { ...customTask, myDay: day };
  assert.equal(isTaskInView(task, "today", day), true);
  assert.equal(isTaskInView(task, "all", day), true);
  assert.equal(isTaskInView(task, "today", "2026-10-07"), false);
  assert.equal(isTaskInView(task, "all", "2026-10-07"), false);
});

test("important and planned custom tasks are promoted into All tasks", () => {
  assert.equal(isTaskInView({ ...customTask, important: true }, "all", day), true);
  assert.equal(isTaskInView({ ...customTask, dueDate: "2026-10-10" }, "planned", day), true);
  assert.equal(isTaskInView({ ...customTask, reminderAt: "2026-10-10T09:00:00Z" }, "all", day), true);
});
