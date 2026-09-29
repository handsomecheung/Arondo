// Service Worker installation & immediate activation
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Presence of a fetch handler is required by Chrome on Android for full PWA
// installability (standalone), not just a home screen shortcut. No caching
// is performed here.
self.addEventListener("fetch", () => {});

// Handle push events from the server (Web Push API)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    try {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (windowClients.some((client) => client.visibilityState === "visible")) return;

      const data = event.data.json();
      const title = data.title || "Arondo";
      const options = {
        body: data.body || "",
        icon: data.icon || "/icon-192.png",
        badge: data.badge || "/badge-96.png",
        tag: data.tag || undefined,
        data: {
          url: data.url || "/",
          ...(data.data || {}),
        },
      };

      await self.registration.showNotification(title, options);
    } catch (err) {
      console.error("[Service Worker] Error displaying push notification:", err);
    }
  })());
});

// Handle notification clicks to open or focus the appropriate web app page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.indexOf(urlToOpen) !== -1 && "focus" in client) {
          return client.focus();
        }
      }
      // If no matching window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
