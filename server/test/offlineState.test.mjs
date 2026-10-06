import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, normalizeState, readCachedState, writeCachedState } from "../web/src/offlineState.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("normalizes old cached states for offline sync", () => {
  assert.deepEqual(normalizeState({ tasks: [{ id: "one" }] }), {
    lists: [], tasks: [{ id: "one" }], deletedLists: [], deletedTasks: [], deletedSteps: [],
  });
});

test("cached state round trips without losing tombstones", () => {
  const storage = memoryStorage();
  const state = { ...emptyState(), deletedSteps: [{ id: "step", deletedAt: "2026-10-06T00:00:00.000Z" }] };
  writeCachedState(state, storage);
  assert.deepEqual(readCachedState(storage), state);
});
