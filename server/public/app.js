const API = "/api";

let state = { lists: [], tasks: [] };
let currentView = "today"; // "today" | "all" | a list id
let toastTimer;

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
const appEl = document.getElementById("app");
const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const toastEl = document.getElementById("toast");

function showError(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 4500);
}

async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    appEl.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    passwordInput.focus();
    throw new Error("Please sign in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

async function action(element, work) {
  element?.classList.add("is-busy");
  try { return await work(); }
  catch (error) { showError(error.message); return null; }
  finally { element?.classList.remove("is-busy"); }
}

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
  state = await request(`${API}/state`);
  render();
}

async function addList(name) {
  const list = await request(`${API}/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  state.lists.push(list);
  currentView = list.id;
  render();
}

async function deleteList(id) {
  await request(`${API}/lists/${id}`, { method: "DELETE" });
  state.lists = state.lists.filter((l) => l.id !== id);
  state.tasks = state.tasks.filter((t) => t.listId !== id);
  if (currentView === id) currentView = "today";
  render();
}

// listId: target list. markToday: also tag the new task as Today right after creating it.
async function addTask(listId, title, markToday) {
  const task = await request(`${API}/lists/${listId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, today: !!markToday }),
  });

  state.tasks.push(task);
  render();
}

async function patchTask(id, patch) {
  const updated = await request(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const idx = state.tasks.findIndex((t) => t.id === id);
  state.tasks[idx] = updated;
  render();
}

async function deleteTask(id) {
  await request(`${API}/tasks/${id}`, { method: "DELETE" });
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
      if (confirm(`Delete "${list.name}" and all its tasks?`)) action(li, () => deleteList(list.id));
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

    li.querySelector(".task-check").addEventListener("click", (event) => {
      action(event.currentTarget, () => patchTask(task.id, { done: !task.done }));
    });

    const titleEl = li.querySelector(".task-title");
    titleEl.addEventListener("blur", () => {
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== task.title) action(li, () => patchTask(task.id, { title: newTitle }));
      else titleEl.textContent = task.title;
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
    });

    li.querySelector(".today-toggle").addEventListener("click", (event) => {
      action(event.currentTarget, () => patchTask(task.id, { today: !task.today }));
    });

    li.querySelector(".task-delete").addEventListener("click", (event) => {
      action(event.currentTarget, () => deleteTask(task.id));
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

  addTaskInput.disabled = state.lists.length === 0;
  addTaskInput.placeholder = state.lists.length ? "Add a task and press Enter…" : "Create a list before adding tasks";
  if (!state.lists.length) {
    addTaskListSelect.classList.add("hidden");
    addTaskHintEl.textContent = "Create your first list using the + button.";
    return;
  }

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

addTaskForm.addEventListener("submit", async (e) => {
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

  await action(addTaskForm, async () => {
    await addTask(listId, title, markToday);
    addTaskInput.value = "";
  });
});

newListBtn.addEventListener("click", () => {
  newListForm.classList.remove("hidden");
  newListInput.focus();
});

cancelListBtn.addEventListener("click", () => {
  newListForm.classList.add("hidden");
  newListInput.value = "";
});

newListForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newListInput.value.trim();
  if (!name) return;
  await action(newListForm, async () => {
    await addList(name);
    newListInput.value = "";
    newListForm.classList.add("hidden");
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Could not sign in");
    passwordInput.value = "";
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    await loadState();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch(`${API}/auth/logout`, { method: "POST" });
  appEl.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.focus();
});

async function boot() {
  try {
    const status = await fetch(`${API}/auth/status`).then((res) => res.json());
    if (!status.authenticated) return passwordInput.focus();
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    await loadState();
  } catch (_error) {
    loginError.textContent = "The server is unavailable.";
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !appEl.classList.contains("hidden")) action(null, loadState);
});

boot();
