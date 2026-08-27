// Presence of a fetch handler is required by Chrome on Android for full PWA
// installability (standalone), not just a home screen shortcut. No caching
// is performed here.
self.addEventListener("fetch", () => {});

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
