// One uploaded image per view, stored on this device without localStorage's small quota.
function database() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('ledger-backgrounds',1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function background(view, file) {
  const db = await database();
  try {
    return await new Promise((resolve,reject) => {
      const writing = file !== undefined;
      const transaction = db.transaction('images',writing ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('images');
      const request = !writing ? store.get(view) : file === null ? store.delete(view) : store.put(file,view);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Could not save background'));
    });
  } finally { db.close(); }
}
