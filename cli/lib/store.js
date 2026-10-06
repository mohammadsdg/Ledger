const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".todo-cli");
const FILE = path.join(DIR, "cache.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    write({ lists: [], tasks: [], deletedLists: [], deletedTasks: [], deletedSteps: [], lastSyncedAt: null });
  }
}

function read() {
  ensure();
  const state = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  state.lists = (state.lists || []).map((x) => ({ ...x, updatedAt: x.updatedAt || x.createdAt }));
  state.tasks = (state.tasks || []).map((x) => ({
    ...x,
    myDay: x.myDay || (x.today ? new Date().toISOString().slice(0, 10) : null),
    updatedAt: x.updatedAt || x.createdAt,
  }));
  state.deletedLists = state.deletedLists || [];
  state.deletedTasks = state.deletedTasks || [];
  state.deletedSteps = state.deletedSteps || [];
  return state;
}

function write(state) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const temp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(temp, FILE);
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { read, write, newId, FILE };
