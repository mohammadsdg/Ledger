const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- helpers ----------

function nowISO() {
  return new Date().toISOString();
}

function findList(state, id) {
  return state.lists.find((l) => l.id === id);
}

function findTask(state, id) {
  return state.tasks.find((t) => t.id === id);
}

// ---------- whole-state (used by CLI: todo fetch) ----------

app.get("/api/state", (req, res) => {
  res.json(db.read());
});

// ---------- lists ----------

app.get("/api/lists", (req, res) => {
  res.json(db.read().lists);
});

app.post("/api/lists", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "List name is required" });
  }
  const state = db.read();
  const list = { id: crypto.randomUUID(), name: name.trim(), createdAt: nowISO() };
  state.lists.push(list);
  db.write(state);
  res.status(201).json(list);
});

app.delete("/api/lists/:id", (req, res) => {
  const state = db.read();
  const list = findList(state, req.params.id);
  if (!list) return res.status(404).json({ error: "List not found" });
  state.lists = state.lists.filter((l) => l.id !== req.params.id);
  state.tasks = state.tasks.filter((t) => t.listId !== req.params.id);
  db.write(state);
  res.status(204).end();
});

// ---------- tasks ----------

// GET /api/tasks            -> all tasks (the "everything" view)
// GET /api/tasks?today=true -> tasks tagged for today, across all lists
// GET /api/tasks?listId=xyz -> tasks in one list
app.get("/api/tasks", (req, res) => {
  const state = db.read();
  let tasks = state.tasks;
  if (req.query.listId) tasks = tasks.filter((t) => t.listId === req.query.listId);
  if (req.query.today === "true") tasks = tasks.filter((t) => t.today);
  res.json(tasks);
});

app.post("/api/lists/:listId/tasks", (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Task title is required" });
  }
  const state = db.read();
  const list = findList(state, req.params.listId);
  if (!list) return res.status(404).json({ error: "List not found" });

  const task = {
    id: crypto.randomUUID(),
    listId: list.id,
    title: title.trim(),
    done: false,
    today: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  state.tasks.push(task);
  db.write(state);
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", (req, res) => {
  const state = db.read();
  const task = findTask(state, req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { title, done, today, listId } = req.body;
  if (typeof title === "string" && title.trim()) task.title = title.trim();
  if (typeof done === "boolean") task.done = done;
  if (typeof today === "boolean") task.today = today;
  if (typeof listId === "string") {
    if (!findList(state, listId)) return res.status(400).json({ error: "Target list not found" });
    task.listId = listId;
  }
  task.updatedAt = nowISO();

  db.write(state);
  res.json(task);
});

app.delete("/api/tasks/:id", (req, res) => {
  const state = db.read();
  const exists = findTask(state, req.params.id);
  if (!exists) return res.status(404).json({ error: "Task not found" });
  state.tasks = state.tasks.filter((t) => t.id !== req.params.id);
  db.write(state);
  res.status(204).end();
});

// ---------- sync (used by CLI: todo push) ----------
// Body: { lists: [...], tasks: [...] }
// Upserts by id. Any id not yet known to the server is created with that same id,
// so the CLI's local ids and the server's ids stay identical.
app.post("/api/sync", (req, res) => {
  const { lists = [], tasks = [] } = req.body;
  const state = db.read();

  for (const incoming of lists) {
    const existing = findList(state, incoming.id);
    if (existing) {
      existing.name = incoming.name;
    } else {
      state.lists.push({
        id: incoming.id,
        name: incoming.name,
        createdAt: incoming.createdAt || nowISO(),
      });
    }
  }

  for (const incoming of tasks) {
    const existing = findTask(state, incoming.id);
    if (existing) {
      existing.title = incoming.title;
      existing.done = !!incoming.done;
      existing.today = !!incoming.today;
      existing.listId = incoming.listId;
      existing.updatedAt = nowISO();
    } else {
      state.tasks.push({
        id: incoming.id,
        listId: incoming.listId,
        title: incoming.title,
        done: !!incoming.done,
        today: !!incoming.today,
        createdAt: incoming.createdAt || nowISO(),
        updatedAt: nowISO(),
      });
    }
  }

  db.write(state);
  res.json(db.read());
});

app.listen(PORT, () => {
  console.log(`Todo API + GUI running at http://localhost:${PORT}`);
});
