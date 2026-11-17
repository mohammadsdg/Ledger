const CACHE = "ledger-shell-__LEDGER_BUILD__";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png" /* LEDGER_ASSETS */];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  const url = new URL(event.request.url);
  const appAsset = event.request.mode === "navigate" || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || ["/manifest.webmanifest", "/favicon.svg"].includes(url.pathname);
  if (!appAsset) return;
  event.respondWith((async () => {
    if (event.request.mode === "navigate") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(event.request, { signal: controller.signal });
        if (!response.ok) throw new Error("Navigation unavailable");
        return response;
      } catch {
        return (await caches.match("/", { cacheName: CACHE })) || Response.error();
      } finally { clearTimeout(timeout); }
    }
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || "Ledger reminder", {
    body: data.body || "A task is ready for you.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.taskId ? `ledger-${data.taskId}` : "ledger-reminder",
    renotify: true,
    data: { url: data.url || "/" },
    actions: [{ action: "open", title: "Open task" }],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    return existing ? existing.navigate(target).then(() => existing.focus()) : clients.openWindow(target);
  }));
});
