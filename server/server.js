require("dotenv").config({ quiet: true });
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const dayjs = require("dayjs");
const webpush = require("web-push");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || APP_PASSWORD;
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
const loginAttempts = new Map();
let pushReady = false;
let pushPublicKey = null;

async function configurePush() {
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    const [rows] = await db.pool.query("SELECT setting_key settingKey,setting_value settingValue FROM app_settings WHERE setting_key IN ('vapid_public_key','vapid_private_key')");
    publicKey = rows.find((row) => row.settingKey === "vapid_public_key")?.settingValue;
    privateKey = rows.find((row) => row.settingKey === "vapid_private_key")?.settingValue;
    if (!publicKey || !privateKey) {
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await db.pool.execute("INSERT INTO app_settings(setting_key,setting_value) VALUES('vapid_public_key',?),('vapid_private_key',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [publicKey, privateKey]);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@mastiam.ir", publicKey, privateKey);
  pushPublicKey = publicKey;
  pushReady = true;
}

async function deliverDueReminders() {
  if (!pushReady) return;
  const [subscriptions] = await db.pool.query("SELECT id,endpoint,p256dh,auth FROM push_subscriptions");
  if (!subscriptions.length) return;
  const [tasks] = await db.pool.execute("SELECT id,title,reminder_at reminderAt FROM tasks WHERE done=FALSE AND reminder_at IS NOT NULL AND reminder_at<=? AND reminder_sent_at IS NULL ORDER BY reminder_at LIMIT 100", [Date.now()]);
  for (const task of tasks) {
    let delivered = false;
    const payload = JSON.stringify({ title: task.title, body: "Ledger reminder", taskId: task.id, url: `/?task=${encodeURIComponent(task.id)}` });
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 24 * 60 * 60, urgency: "high" });
        delivered = true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) await db.pool.execute("DELETE FROM push_subscriptions WHERE id=?", [subscription.id]);
        else console.error(`Push notification failed: ${error.message}`);
      }
    }
    if (delivered) await db.pool.execute("UPDATE tasks SET reminder_sent_at=? WHERE id=? AND reminder_sent_at IS NULL", [Date.now(), task.id]);
  }
}

function nextOccurrence(value, rule) {
  let date = dayjs(value || new Date());
  if (rule === "daily") date = date.add(1, "day");
  else if (rule === "weekdays") { do { date = date.add(1, "day"); } while ([0, 6].includes(date.day())); }
  else if (rule === "weekly") date = date.add(1, "week");
  else if (rule === "monthly") date = date.add(1, "month");
  else if (rule === "yearly") date = date.add(1, "year");
  else return null;
  return date.format("YYYY-MM-DD");
}

if (!APP_PASSWORD) {
  console.error("APP_PASSWORD is required. Refusing to start an unprotected server.");
  if (require.main === module) process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "dist")));

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

app.get("/api/push/public-key", route(async (_req, res) => {
  if (!pushPublicKey) return res.status(503).json({ error: "Notifications are not ready" });
  res.json({ publicKey: pushPublicKey });
}));
app.post("/api/push/subscribe", route(async (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: "Invalid push subscription" });
  const id = crypto.createHash("sha256").update(subscription.endpoint).digest("hex");
  const now = Date.now();
  await db.pool.execute("INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth=VALUES(auth),updated_at=VALUES(updated_at)", [id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, now, now]);
  res.status(201).json({ subscribed: true });
}));
app.post("/api/push/unsubscribe", route(async (req, res) => {
  if (req.body?.endpoint) {
    const id = crypto.createHash("sha256").update(req.body.endpoint).digest("hex");
    await db.pool.execute("DELETE FROM push_subscriptions WHERE id=?", [id]);
  }
  res.status(204).end();
}));

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
  let sql = "SELECT id,list_id listId,title,done,my_day myDay,important,reminder_at reminderAt,due_date dueDate,repeat_rule repeatRule,note,created_at createdAt,updated_at updatedAt FROM tasks";
  const where = [], values = [];
  if (req.query.listId) { where.push("list_id=?"); values.push(req.query.listId); }
  if (req.query.today === "true") where.push("my_day=CURRENT_DATE");
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  const [rows] = await db.pool.execute(`${sql} ORDER BY created_at,id`, values);
  res.json(rows.map((x) => ({ ...x, done: !!x.done, important: !!x.important, reminderAt: x.reminderAt == null ? null : db.toISO(x.reminderAt), createdAt: db.toISO(x.createdAt), updatedAt: db.toISO(x.updatedAt) })));
}));
app.post("/api/lists/:listId/tasks", route(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Task title is required" });
  const [lists] = await db.pool.execute("SELECT id FROM lists WHERE id=?", [req.params.listId]);
  if (!lists.length) return res.status(404).json({ error: "List not found" });
  const now = Date.now();
  const myDay = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.myDay || "") ? req.body.myDay : null;
  const important = !!req.body?.important;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.dueDate || "") ? req.body.dueDate : null;
  const task = { id: crypto.randomUUID(), listId: req.params.listId, title, done: false, myDay, important, reminderAt: null, dueDate, repeatRule: null, note: "", steps: [], createdAt: db.toISO(now), updatedAt: db.toISO(now) };
  await db.pool.execute("INSERT INTO tasks(id,list_id,title,done,today,my_day,important,reminder_at,due_date,repeat_rule,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [task.id, task.listId, title, task.done, !!myDay, myDay, important, null, dueDate, null, "", now, now]);
  res.status(201).json(task);
}));
app.patch("/api/tasks/:id", route(async (req, res) => {
  const task = await db.transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT * FROM tasks WHERE id=? FOR UPDATE", [req.params.id]);
    if (!rows.length) return null;
    const old = rows[0];
    const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : old.title;
    const done = typeof req.body.done === "boolean" ? req.body.done : !!old.done;
    const myDay = req.body.myDay === null ? null : (/^\d{4}-\d{2}-\d{2}$/.test(req.body.myDay || "") ? req.body.myDay : old.my_day);
    const important = typeof req.body.important === "boolean" ? req.body.important : !!old.important;
    const reminderChanged = Object.prototype.hasOwnProperty.call(req.body, "reminderAt");
    const reminderAt = req.body.reminderAt === null ? null : (req.body.reminderAt ? db.toMillis(req.body.reminderAt, old.reminder_at) : old.reminder_at);
    const reminderSentAt = reminderChanged ? null : old.reminder_sent_at;
    const dueDate = req.body.dueDate === null ? null : (/^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate || "") ? req.body.dueDate : old.due_date);
    const repeatRule = req.body.repeatRule === null ? null : (typeof req.body.repeatRule === "string" ? req.body.repeatRule.slice(0, 32) || null : old.repeat_rule);
    const note = typeof req.body.note === "string" ? req.body.note.slice(0, 10000) : old.note;
    const listId = typeof req.body.listId === "string" ? req.body.listId : old.list_id;
    const [lists] = await conn.execute("SELECT id FROM lists WHERE id=?", [listId]);
    if (!lists.length) return { invalidList: true };
    const now = Date.now();
    await conn.execute("UPDATE tasks SET list_id=?,title=?,done=?,today=?,my_day=?,important=?,reminder_at=?,reminder_sent_at=?,due_date=?,repeat_rule=?,note=?,updated_at=? WHERE id=?", [listId, title, done, !!myDay, myDay, important, reminderAt, reminderSentAt, dueDate, repeatRule, note, now, req.params.id]);
    if (!old.done && done && repeatRule) {
      const nextDue = nextOccurrence(dueDate, repeatRule);
      const nextId = crypto.randomUUID();
      await conn.execute("INSERT INTO tasks(id,list_id,title,done,today,my_day,important,reminder_at,due_date,repeat_rule,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [nextId, listId, title, false, false, null, important, null, nextDue, repeatRule, note, now, now]);
      const [oldSteps] = await conn.execute("SELECT title FROM steps WHERE task_id=? ORDER BY created_at,id", [req.params.id]);
      for (const oldStep of oldSteps) {
        await conn.execute("INSERT INTO steps(id,task_id,title,done,created_at,updated_at) VALUES(?,?,?,?,?,?)", [crypto.randomUUID(), nextId, oldStep.title, false, now, now]);
      }
    }
    const [steps] = await conn.execute("SELECT id,task_id taskId,title,done,created_at createdAt,updated_at updatedAt FROM steps WHERE task_id=? ORDER BY created_at,id", [req.params.id]);
    return { id: req.params.id, listId, title, done, myDay, important, reminderAt: reminderAt == null ? null : db.toISO(reminderAt), dueDate, repeatRule, note, steps: steps.map((x) => ({ ...x, done: !!x.done, createdAt: db.toISO(x.createdAt), updatedAt: db.toISO(x.updatedAt) })), createdAt: db.toISO(old.created_at), updatedAt: db.toISO(now) };
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.invalidList) return res.status(400).json({ error: "Target list not found" });
  res.json(task);
}));

app.post("/api/tasks/:taskId/steps", route(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Step title is required" });
  const [tasks] = await db.pool.execute("SELECT id FROM tasks WHERE id=?", [req.params.taskId]);
  if (!tasks.length) return res.status(404).json({ error: "Task not found" });
  const now = Date.now();
  const step = { id: crypto.randomUUID(), taskId: req.params.taskId, title: title.slice(0, 500), done: false, createdAt: db.toISO(now), updatedAt: db.toISO(now) };
  await db.transaction(async (conn) => {
    await conn.execute("INSERT INTO steps(id,task_id,title,done,created_at,updated_at) VALUES(?,?,?,?,?,?)", [step.id, step.taskId, step.title, false, now, now]);
    await conn.execute("UPDATE tasks SET updated_at=? WHERE id=?", [now, step.taskId]);
  });
  res.status(201).json(step);
}));
app.patch("/api/steps/:id", route(async (req, res) => {
  const step = await db.transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT * FROM steps WHERE id=? FOR UPDATE", [req.params.id]);
    if (!rows.length) return null;
    const old = rows[0], now = Date.now();
    const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 500) : old.title;
    const done = typeof req.body.done === "boolean" ? req.body.done : !!old.done;
    await conn.execute("UPDATE steps SET title=?,done=?,updated_at=? WHERE id=?", [title, done, now, req.params.id]);
    await conn.execute("UPDATE tasks SET updated_at=? WHERE id=?", [now, old.task_id]);
    return { id: req.params.id, taskId: old.task_id, title, done, createdAt: db.toISO(old.created_at), updatedAt: db.toISO(now) };
  });
  if (!step) return res.status(404).json({ error: "Step not found" });
  res.json(step);
}));
app.delete("/api/steps/:id", route(async (req, res) => {
  const removed = await db.transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT task_id taskId FROM steps WHERE id=?", [req.params.id]);
    if (!rows.length) return false;
    await conn.execute("DELETE FROM steps WHERE id=?", [req.params.id]);
    await conn.execute("UPDATE tasks SET updated_at=? WHERE id=?", [Date.now(), rows[0].taskId]);
    return true;
  });
  if (!removed) return res.status(404).json({ error: "Step not found" });
  res.status(204).end();
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
      const myDay = /^\d{4}-\d{2}-\d{2}$/.test(task.myDay || "") ? task.myDay : (task.today ? new Date().toISOString().slice(0, 10) : null);
      await conn.execute("INSERT INTO tasks(id,list_id,title,done,today,my_day,important,reminder_at,due_date,repeat_rule,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE list_id=IF(VALUES(updated_at)>updated_at,VALUES(list_id),list_id),title=IF(VALUES(updated_at)>updated_at,VALUES(title),title),done=IF(VALUES(updated_at)>updated_at,VALUES(done),done),today=IF(VALUES(updated_at)>updated_at,VALUES(today),today),my_day=IF(VALUES(updated_at)>updated_at,VALUES(my_day),my_day),updated_at=GREATEST(updated_at,VALUES(updated_at))", [task.id, task.listId, String(task.title).trim(), !!task.done, !!myDay, myDay, !!task.important, task.reminderAt ? db.toMillis(task.reminderAt) : null, task.dueDate || null, task.repeatRule || null, task.note || "", db.toMillis(task.createdAt, updated), updated]);
      await conn.execute("DELETE FROM deletions WHERE entity_type='task' AND entity_id=? AND deleted_at<?", [task.id, updated]);
    }
    return db.getState(conn);
  });
  res.json(state);
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

if (require.main === module) {
  db.pool.query("SELECT 1").then(async () => {
    await configurePush();
    await deliverDueReminders();
    setInterval(() => deliverDueReminders().catch((error) => console.error(error)), 30_000).unref();
    app.listen(PORT, () => console.log(`Ledger running at http://localhost:${PORT}`));
  }).catch((error) => {
    console.error(`Could not connect to MySQL: ${error.message}`);
    process.exit(1);
  });
}
module.exports = app;
