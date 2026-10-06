require("dotenv").config({ quiet: true });
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || APP_PASSWORD;
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
const loginAttempts = new Map();

if (!APP_PASSWORD) {
  console.error("APP_PASSWORD is required. Refusing to start an unprotected server.");
  if (require.main === module) process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function cookies(header = "") {
  return Object.fromEntries(header.split(";").filter((x) => x.includes("=")).map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1))];
  }));
}
function sign(expires) {
  const value = String(expires);
  return `${value}.${crypto.createHmac("sha256", SESSION_SECRET || "").update(value).digest("hex")}`;
}
function validSession(token) {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires).split(".")[1]);
}
function authenticated(req) {
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return (bearer && safeEqual(bearer, APP_PASSWORD)) || validSession(cookies(req.get("cookie")).ledger_session);
}

app.get("/api/auth/status", (req, res) => res.json({ authenticated: !!authenticated(req) }));
app.post("/api/auth/login", (req, res) => {
  const recent = (loginAttempts.get(req.ip) || []).filter((x) => x > Date.now() - 15 * 60_000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many attempts. Try again later." });
  if (!safeEqual(req.body?.password, APP_PASSWORD)) {
    loginAttempts.set(req.ip, [...recent, Date.now()]);
    return res.status(401).json({ error: "Wrong password" });
  }
  loginAttempts.delete(req.ip);
  const maxAge = 30 * 24 * 60 * 60;
  res.set("Set-Cookie", `ledger_session=${encodeURIComponent(sign(Date.now() + maxAge * 1000))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie}`);
  res.json({ authenticated: true });
});
app.post("/api/auth/logout", (_req, res) => {
  res.set("Set-Cookie", `ledger_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie}`).status(204).end();
});
app.use("/api", (req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: "Authentication required" }));

async function putDeletion(conn, type, id, deletedAt) {
  await conn.execute("INSERT INTO deletions(entity_type,entity_id,deleted_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE deleted_at=GREATEST(deleted_at,VALUES(deleted_at))", [type, id, deletedAt]);
}
async function deletionTime(conn, type, id) {
  const [rows] = await conn.execute("SELECT deleted_at deletedAt FROM deletions WHERE entity_type=? AND entity_id=?", [type, id]);
  return rows.length ? Number(rows[0].deletedAt) : 0;
}
async function applyDeletion(conn, type, item) {
  if (!item?.id) return;
  const time = db.toMillis(item.deletedAt);
  const table = type === "list" ? "lists" : "tasks";
  const [rows] = await conn.execute(`SELECT updated_at updatedAt FROM ${table} WHERE id=? FOR UPDATE`, [item.id]);
  if (!rows.length || Number(rows[0].updatedAt) <= time) {
    await conn.execute(`DELETE FROM ${table} WHERE id=?`, [item.id]);
    await putDeletion(conn, type, item.id, time);
  }
}

app.get("/api/state", route(async (_req, res) => res.json(await db.getState())));
app.get("/api/lists", route(async (_req, res) => res.json((await db.getState()).lists)));
app.post("/api/lists", route(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "List name is required" });
  const now = Date.now();
  const list = { id: crypto.randomUUID(), name, createdAt: db.toISO(now), updatedAt: db.toISO(now) };
  await db.pool.execute("INSERT INTO lists(id,name,created_at,updated_at) VALUES(?,?,?,?)", [list.id, name, now, now]);
  res.status(201).json(list);
}));
app.delete("/api/lists/:id", route(async (req, res) => {
  const removed = await db.transaction(async (conn) => {
    const [lists] = await conn.execute("SELECT id FROM lists WHERE id=? FOR UPDATE", [req.params.id]);
    if (!lists.length) return false;
    const now = Date.now();
    const [tasks] = await conn.execute("SELECT id FROM tasks WHERE list_id=?", [req.params.id]);
    for (const task of tasks) await putDeletion(conn, "task", task.id, now);
    await putDeletion(conn, "list", req.params.id, now);
    await conn.execute("DELETE FROM lists WHERE id=?", [req.params.id]);
    return true;
  });
  if (!removed) return res.status(404).json({ error: "List not found" });
  res.status(204).end();
}));

app.get("/api/tasks", route(async (req, res) => {
  let sql = "SELECT id,list_id listId,title,done,today,created_at createdAt,updated_at updatedAt FROM tasks";
  const where = [], values = [];
  if (req.query.listId) { where.push("list_id=?"); values.push(req.query.listId); }
  if (req.query.today === "true") where.push("today=1");
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  const [rows] = await db.pool.execute(`${sql} ORDER BY created_at,id`, values);
  res.json(rows.map((x) => ({ ...x, done: !!x.done, today: !!x.today, createdAt: db.toISO(x.createdAt), updatedAt: db.toISO(x.updatedAt) })));
}));
app.post("/api/lists/:listId/tasks", route(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Task title is required" });
  const [lists] = await db.pool.execute("SELECT id FROM lists WHERE id=?", [req.params.listId]);
  if (!lists.length) return res.status(404).json({ error: "List not found" });
  const now = Date.now();
  const task = { id: crypto.randomUUID(), listId: req.params.listId, title, done: false, today: !!req.body.today, createdAt: db.toISO(now), updatedAt: db.toISO(now) };
  await db.pool.execute("INSERT INTO tasks(id,list_id,title,done,today,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", [task.id, task.listId, title, task.done, task.today, now, now]);
  res.status(201).json(task);
}));
app.patch("/api/tasks/:id", route(async (req, res) => {
  const task = await db.transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT * FROM tasks WHERE id=? FOR UPDATE", [req.params.id]);
    if (!rows.length) return null;
    const old = rows[0];
    const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : old.title;
    const done = typeof req.body.done === "boolean" ? req.body.done : !!old.done;
    const today = typeof req.body.today === "boolean" ? req.body.today : !!old.today;
    const listId = typeof req.body.listId === "string" ? req.body.listId : old.list_id;
    const [lists] = await conn.execute("SELECT id FROM lists WHERE id=?", [listId]);
    if (!lists.length) return { invalidList: true };
    const now = Date.now();
    await conn.execute("UPDATE tasks SET list_id=?,title=?,done=?,today=?,updated_at=? WHERE id=?", [listId, title, done, today, now, req.params.id]);
    return { id: req.params.id, listId, title, done, today, createdAt: db.toISO(old.created_at), updatedAt: db.toISO(now) };
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.invalidList) return res.status(400).json({ error: "Target list not found" });
  res.json(task);
}));
app.delete("/api/tasks/:id", route(async (req, res) => {
  const removed = await db.transaction(async (conn) => {
    const [result] = await conn.execute("DELETE FROM tasks WHERE id=?", [req.params.id]);
    if (!result.affectedRows) return false;
    await putDeletion(conn, "task", req.params.id, Date.now());
    return true;
  });
  if (!removed) return res.status(404).json({ error: "Task not found" });
  res.status(204).end();
}));

app.post("/api/sync", route(async (req, res) => {
  const input = req.body || {};
  const state = await db.transaction(async (conn) => {
    for (const x of input.deletedTasks || []) await applyDeletion(conn, "task", x);
    for (const x of input.deletedLists || []) await applyDeletion(conn, "list", x);
    for (const list of input.lists || []) {
      if (!list?.id || !String(list.name || "").trim()) continue;
      const updated = db.toMillis(list.updatedAt || list.createdAt);
      if (await deletionTime(conn, "list", list.id) >= updated) continue;
      await conn.execute("INSERT INTO lists(id,name,created_at,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE name=IF(VALUES(updated_at)>updated_at,VALUES(name),name),updated_at=GREATEST(updated_at,VALUES(updated_at))", [list.id, String(list.name).trim(), db.toMillis(list.createdAt, updated), updated]);
      await conn.execute("DELETE FROM deletions WHERE entity_type='list' AND entity_id=? AND deleted_at<?", [list.id, updated]);
    }
    for (const task of input.tasks || []) {
      if (!task?.id || !task.listId || !String(task.title || "").trim()) continue;
      const updated = db.toMillis(task.updatedAt || task.createdAt);
      if (await deletionTime(conn, "task", task.id) >= updated) continue;
      const [lists] = await conn.execute("SELECT id FROM lists WHERE id=?", [task.listId]);
      if (!lists.length) continue;
      await conn.execute("INSERT INTO tasks(id,list_id,title,done,today,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE list_id=IF(VALUES(updated_at)>updated_at,VALUES(list_id),list_id),title=IF(VALUES(updated_at)>updated_at,VALUES(title),title),done=IF(VALUES(updated_at)>updated_at,VALUES(done),done),today=IF(VALUES(updated_at)>updated_at,VALUES(today),today),updated_at=GREATEST(updated_at,VALUES(updated_at))", [task.id, task.listId, String(task.title).trim(), !!task.done, !!task.today, db.toMillis(task.createdAt, updated), updated]);
      await conn.execute("DELETE FROM deletions WHERE entity_type='task' AND entity_id=? AND deleted_at<?", [task.id, updated]);
    }
    return db.getState(conn);
  });
  res.json(state);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
  db.pool.query("SELECT 1").then(() => app.listen(PORT, () => console.log(`Ledger running at http://localhost:${PORT}`))).catch((error) => {
    console.error(`Could not connect to MySQL: ${error.message}`);
    process.exit(1);
  });
}
module.exports = app;
