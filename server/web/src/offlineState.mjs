const CACHE_KEY = "ledger-offline-state-v1";

export const emptyState = () => ({
  lists: [],
  tasks: [],
  deletedLists: [],
  deletedTasks: [],
  deletedSteps: [],
});

export function normalizeState(value = {}) {
  return {
    lists: Array.isArray(value.lists) ? value.lists : [],
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    deletedLists: Array.isArray(value.deletedLists) ? value.deletedLists : [],
    deletedTasks: Array.isArray(value.deletedTasks) ? value.deletedTasks : [],
    deletedSteps: Array.isArray(value.deletedSteps) ? value.deletedSteps : [],
  };
}

export function readCachedState(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(CACHE_KEY);
    return value ? normalizeState(JSON.parse(value)) : null;
  } catch (_error) {
    return null;
  }
}

export function writeCachedState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(normalizeState(state)));
  } catch (_error) {
    // A full or unavailable browser store should not make the app unusable.
  }
}

export function removeCachedState(storage = globalThis.localStorage) {
  try { storage.removeItem(CACHE_KEY); } catch (_error) {}
}

export { CACHE_KEY };
