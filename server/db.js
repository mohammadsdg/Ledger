const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ledger",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  charset: "utf8mb4",
  dateStrings: true,
});

const toISO = (value) => new Date(Number(value)).toISOString();
function toMillis(value, fallback = Date.now()) {
  const millis = new Date(value || fallback).getTime();
  return Number.isFinite(millis) ? millis : fallback;
}

async function getState(conn = pool) {
  const [lists] = await conn.query("SELECT id,name,created_at createdAt,updated_at updatedAt FROM lists ORDER BY created_at,id");
  const [tasks] = await conn.query("SELECT id,list_id listId,title,done,my_day myDay,important,reminder_at reminderAt,due_date dueDate,repeat_rule repeatRule,note,created_at createdAt,updated_at updatedAt FROM tasks ORDER BY created_at,id");
  const [steps] = await conn.query("SELECT id,task_id taskId,title,done,created_at createdAt,updated_at updatedAt FROM steps ORDER BY created_at,id");
  const [deleted] = await conn.query("SELECT entity_type entityType,entity_id id,deleted_at deletedAt FROM deletions");
  return {
    lists: lists.map((x) => ({ ...x, createdAt: toISO(x.createdAt), updatedAt: toISO(x.updatedAt) })),
    tasks: tasks.map((x) => ({
      ...x,
      done: !!x.done,
      important: !!x.important,
      myDay: x.myDay || null,
      reminderAt: x.reminderAt == null ? null : toISO(x.reminderAt),
      dueDate: x.dueDate || null,
      steps: steps.filter((step) => step.taskId === x.id).map((step) => ({ ...step, done: !!step.done, createdAt: toISO(step.createdAt), updatedAt: toISO(step.updatedAt) })),
      createdAt: toISO(x.createdAt),
      updatedAt: toISO(x.updatedAt),
    })),
    deletedLists: deleted.filter((x) => x.entityType === "list").map((x) => ({ id: x.id, deletedAt: toISO(x.deletedAt) })),
    deletedTasks: deleted.filter((x) => x.entityType === "task").map((x) => ({ id: x.id, deletedAt: toISO(x.deletedAt) })),
  };
}

async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { pool, getState, transaction, toMillis, toISO };
