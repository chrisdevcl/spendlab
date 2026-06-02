// SpendLab Service Worker
// This is the primary SW, committed to git and served at /sw.js.
// next-pwa generates Workbox to /workbox-sw.js (a separate file) so it
// cannot overwrite this file anymore.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "SpendLab", body: event.data.text(), url: "/" };
  }

  const { title = "SpendLab", body = "", url = "/" } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      data: { url },
      vibrate: [100, 50, 100],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({ type: "NAVIGATE", url });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ── Workbox caching (production only) ────────────────────────────────────────
// next-pwa generates /workbox-sw.js during build. In development that file
// does not exist, so the import is skipped gracefully.
try {
  importScripts("/workbox-sw.js");
} catch {
  // dev mode — workbox-sw.js not generated, offline caching unavailable
}
