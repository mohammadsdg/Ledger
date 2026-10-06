const BASE = process.env.TODO_API_URL || "http://localhost:4000/api";
const PASSWORD = process.env.TODO_PASSWORD || "";

function headers(json = false) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(PASSWORD ? { Authorization: `Bearer ${PASSWORD}` } : {}),
  };
}

async function result(res) {
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("password required (set TODO_PASSWORD)");
  throw new Error(body.error || `server responded ${res.status}`);
}

async function getState() {
  return result(await fetch(`${BASE}/state`, { headers: headers() }));
}

async function sync(state) {
  const res = await fetch(`${BASE}/sync`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(state),
  });
  return result(res);
}

module.exports = { getState, sync, BASE };
