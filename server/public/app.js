const API = "/api";

let state = { lists: [], tasks: [] };
let currentView = "today"; // "today" | "all" | a list id

const listNavEl = document.getElementById("listNav");
const taskListEl = document.getElementById("taskList");
const viewTitleEl = document.getElementById("viewTitle");
const viewSubtitleEl = document.getElementById("viewSubtitle");
const emptyStateEl = document.getElementById("emptyState");
const addTaskForm = document.getElementById("addTaskForm");
const addTaskInput = document.getElementById("addTaskInput");
const addTaskListSelect = document.getElementById("addTaskList");
const addTaskHintEl = document.getElementById("addTaskHint");
const newListBtn = document.getElementById("newListBtn");
const newListForm = document.getElementById("newListForm");
const newListInput = document.getElementById("newListInput");
const cancelListBtn = document.getElementById("cancelListBtn");
const sidebarEl = document.getElementById("sidebar");
const overlayEl = document.getElementById("overlay");
const menuToggleBtn = document.getElementById("menuToggle");

// ---------- theme ----------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("todo-theme", theme);
  const icon = theme === "dark" ? "☀" : "☾";
  document.getElementById("themeToggle").textContent = icon;
  document.getElementById("themeToggleDesktop").textContent = icon;
}

function initTheme() {
  const saved = localStorage.getItem("todo-theme");
  applyTheme(saved || "dark");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("themeToggleDesktop").addEventListener("click", toggleTheme);
initTheme();

// ---------- mobile drawer ----------

function openSidebar() {
  sidebarEl.classList.add("is-open");
  overlayEl.classList.remove("hidden");
}

function closeSidebar() {
  sidebarEl.classList.remove("is-open");
  overlayEl.classList.add("hidden");
}

menuToggleBtn.addEventListener("click", openSidebar);
overlayEl.addEventListener("click", closeSidebar);

// ---------- data ----------

async function loadState() {
  const res = await fetch(`${API}/state`);
  state = await res.json();
  render();
}

async function addList(name) {
  const res = await fetch(`${API}/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const list = await res.json();
  state.lists.push(list);
  currentView = list.id;
  render();
}

async function deleteList(id) {
  await fetch(`${API}/lists/${id}`, { method: "DELETE" });
  state.lists = state.lists.filter((l) => l.id !== id);
  state.tasks = state.tasks.filter((t) => t.listId !== id);
  if (currentView === id) currentView = "today";
  render();
}

// listId: target list. markToday: also tag the new task as Today right after creating it.
async function addTask(listId, title, markToday) {
  const res = await fetch(`${API}/lists/${listId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  let task = await res.json();

  if (markToday) {
    const patchRes = await fetch(`${API}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ today: true }),
    });
    task = await patchRes.json();
  }

  state.tasks.push(task);
  render();
}

async function patchTask(id, patch) {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const updated = await res.json();
  const idx = state.tasks.findIndex((t) => t.id === id);
  state.tasks[idx] = updated;
  render();
}

async function deleteTask(id) {
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
  state.tasks = state.tasks.filter((t) => t.id !== id);
  render();
}

// ---------- view helpers ----------

function tasksForView() {
  if (currentView === "today") return state.tasks.filter((t) => t.today);
  if (currentView === "all") return state.tasks;
  return state.tasks.filter((t) => t.listId === currentView);
}

function listName(id) {
  const l = state.lists.find((l) => l.id === id);
  return l ? l.name : "";
}

// Where a new task goes when you're in the "Today" view: prefer a list named
// "Inbox", otherwise fall back to whichever list was created first.
function inboxListId() {
  const byName = state.lists.find((l) => l.name.trim().toLowerCase() === "inbox");
  if (byName) return byName.id;
  return state.lists[0] ? state.lists[0].id : null;
}

// ---------- render ----------

function render() {
  renderSidebar();
  renderHeader();
  renderTasks();
  renderAddTaskControls();
}

function renderSidebar() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === currentView);
  });

  listNavEl.innerHTML = "";
  state.lists.forEach((list) => {
    const count = state.tasks.filter((t) => t.listId === list.id && !t.done).length;
    const li = document.createElement("li");
    li.classList.toggle("is-active", currentView === list.id);
    li.innerHTML = `
      <span class="list-name-wrap">
        <span class="nav-dot dot-list"></span>
        <span class="list-name">${escapeHtml(list.name)}</span>
      </span>
      <span style="display:flex; align-items:center; gap:6px;">
        <span class="list-count">${count || ""}</span>
        <button class="list-delete" title="Delete list">✕</button>
      </span>
    `;
    li.addEventListener("click", (e) => {
      if (e.target.closest(".list-delete")) return;
      currentView = list.id;
      render();
      closeSidebar();
    });
    li.querySelector(".list-delete").addEventListener("click", () => {
      if (confirm(`Delete "${list.name}" and all its tasks?`)) deleteList(list.id);
    });
    listNavEl.appendChild(li);
  });
}

function renderHeader() {
  if (currentView === "today") {
    viewTitleEl.textContent = "Today";
    viewSubtitleEl.textContent = "Everything tagged for today, across every list.";
  } else if (currentView === "all") {
    viewTitleEl.textContent = "All tasks";
    viewSubtitleEl.textContent = "Every task, in every list.";
  } else {
    viewTitleEl.textContent = listName(currentView);
    viewSubtitleEl.textContent = "Tasks in this list.";
  }
}

function renderTasks() {
  const tasks = tasksForView().slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  taskListEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", tasks.length > 0);

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-row";
    const showListTag = currentView === "today" || currentView === "all";
    li.innerHTML = `
      <button class="task-check ${task.done ? "checked" : ""}">${task.done ? "✓" : ""}</button>
      <span class="task-title ${task.done ? "done" : ""}" contenteditable="true" spellcheck="false">${escapeHtml(task.title)}</span>
      ${showListTag ? `<span class="task-list-tag">${escapeHtml(listName(task.listId))}</span>` : ""}
      <button class="today-toggle ${task.today ? "is-on" : ""}" title="Toggle Today">★</button>
      <button class="task-delete" title="Delete task">✕</button>
    `;

    li.querySelector(".task-check").addEventListener("click", () => {
      patchTask(task.id, { done: !task.done });
    });

    const titleEl = li.querySelector(".task-title");
    titleEl.addEventListener("blur", () => {
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== task.title) patchTask(task.id, { title: newTitle });
      else titleEl.textContent = task.title;
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
    });

    li.querySelector(".today-toggle").addEventListener("click", () => {
      patchTask(task.id, { today: !task.today });
    });

    li.querySelector(".task-delete").addEventListener("click", () => {
      deleteTask(task.id);
    });

    taskListEl.appendChild(li);
  });
}

// The list picker is only shown for "All tasks", where there's no implicit
// target list. In "Today" the task goes to Inbox + gets tagged Today. In a
// specific list view, it goes straight into that list. Both are automatic
// now — no picker, no dropdown, no ambiguity.
function renderAddTaskControls() {
  addTaskListSelect.innerHTML = "";
  state.lists.forEach((list) => {
    const opt = document.createElement("option");
    opt.value = list.id;
    opt.textContent = list.name;
    addTaskListSelect.appendChild(opt);
  });

  if (currentView === "all") {
    addTaskListSelect.classList.remove("hidden");
    addTaskHintEl.textContent = "Pick a list on the right, then add your task.";
  } else if (currentView === "today") {
    addTaskListSelect.classList.add("hidden");
    addTaskHintEl.textContent = `Goes to ${listName(inboxListId())}, tagged Today.`;
  } else {
    addTaskListSelect.classList.add("hidden");
    addTaskHintEl.textContent = `Goes to ${listName(currentView)}.`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- events ----------

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    render();
    closeSidebar();
  });
});

addTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = addTaskInput.value.trim();
  if (!title) return;

  let listId;
  let markToday = false;

  if (currentView === "today") {
    listId = inboxListId();
    markToday = true;
  } else if (currentView === "all") {
    listId = addTaskListSelect.value || state.lists[0]?.id;
  } else {
    listId = currentView;
  }

  if (!listId) return;

  addTaskInput.value = "";
  addTask(listId, title, markToday);
});

newListBtn.addEventListener("click", () => {
  newListForm.classList.remove("hidden");
  newListInput.focus();
});

cancelListBtn.addEventListener("click", () => {
  newListForm.classList.add("hidden");
  newListInput.value = "";
});

newListForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = newListInput.value.trim();
  if (!name) return;
  newListInput.value = "";
  newListForm.classList.add("hidden");
  addList(name);
});

loadState();
