const BASE = process.env.TODO_API_URL || "http://localhost:4000/api";

async function getState() {
  const res = await fetch(`${BASE}/state`);
  if (!res.ok) throw new Error(`server responded ${res.status}`);
  return res.json();
}

async function sync(lists, tasks) {
  const res = await fetch(`${BASE}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lists, tasks }),
  });
  if (!res.ok) throw new Error(`server responded ${res.status}`);
  return res.json();
}

module.exports = { getState, sync, BASE };
