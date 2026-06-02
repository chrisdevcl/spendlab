/**
 * Custom service worker code merged by next-pwa into sw.js at build time.
 *
 * Handles:
 *   - Web Push notifications (background / when app is closed)
 *   - Notification click (opens the app to /groups)
 */

self.addEventListener("push", (event) => {
  const data = event.data?.json?.() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "SpendLab", {
      body: data.body ?? "Tienes una nueva notificación",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/groups";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => "focus" in c);
        if (existing) {
          existing.focus();
          existing.postMessage({ type: "NAVIGATE", url });
          return;
        }
        return clients.openWindow(url);
      })
  );
});
