export function isPlanned(task) {
  return !!(task.dueDate || task.reminderAt);
}

export function isTaskInView(task, view, currentDay) {
  if (view === "today") return task.myDay === currentDay;
  if (view === "important") return !!task.important;
  if (view === "planned") return isPlanned(task);
  if (view === "all") return task.listId === "all" || task.myDay === currentDay || (!!task.myDay && task.myDay < currentDay && !task.done) || !!task.important || isPlanned(task);
  return task.listId === view;
}
