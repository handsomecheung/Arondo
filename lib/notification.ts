/**
 * Utility functions for Web Notifications API and PWA Service Worker integration.
 * All comments are in English as per system instructions.
 */

/**
 * Checks if Notification API is supported in the current environment.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/**
 * Requests permission to show notifications.
 * @returns Promise resolving to the permission state ('granted', 'denied', or 'default')
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return "default";
  }

  // Check if permission is already granted
  if (Notification.permission === "granted") {
    return "granted";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return "default";
  }
}

/**
 * Sends a native push notification using the Service Worker registration.
 * Using Service Worker allows the notification to show even when the tab is in the background.
 * 
 * @param title The notification title
 * @param body The main text content of the notification
 * @param url Optional relative URL to open when the notification is clicked
 */
export async function sendNotification(
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/" },
      tag: "arondo-task-notification",
      renotify: true,
    } as any);
  } catch (error) {
    console.error("Failed to send notification via Service Worker:", error);
    // Fallback to standard Notification API if Service Worker is not ready or fails
    try {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        data: { url: url || "/" },
      });
    } catch (fallbackError) {
      console.error("Fallback notification also failed:", fallbackError);
    }
  }
}
