const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".todo-cli");
const FILE = path.join(DIR, "cache.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    write({ lists: [], tasks: [], lastSyncedAt: null });
  }
}

function read() {
  ensure();
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

function write(state) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf-8");
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { read, write, newId, FILE };
