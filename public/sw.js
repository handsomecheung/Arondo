// Presence of a fetch handler is required by Chrome on Android for full PWA
// installability (standalone), not just a home screen shortcut. No caching
// is performed here.
self.addEventListener("fetch", () => {});
