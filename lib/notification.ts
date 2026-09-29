/**
 * Utility functions for Web Notifications API, PWA Service Worker, and Web Push (VAPID) integration.
 * All comments are in English as per system instructions.
 */

/**
 * Convert base64 url string to Uint8Array for PushManager subscribe
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if Notification API and Service Worker are supported in the current environment.
 */
export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/**
 * Checks if Web Push API (PushManager) is supported in the current environment.
 */
export function isWebPushSupported(): boolean {
  return (
    isNotificationSupported() &&
    "PushManager" in window
  );
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
    // Standard Promise-based API with callback fallback for older WebKit / Safari
    return await new Promise<NotificationPermission>((resolve) => {
      const result = Notification.requestPermission((status) => {
        resolve(status);
      });
      if (result && typeof (result as any).then === "function") {
        (result as Promise<NotificationPermission>).then(resolve).catch(() => resolve("default"));
      }
    });
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return Notification.permission || "default";
  }
}

/**
 * Fetches the VAPID public key from the Arondo server.
 */
export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
    const res = await fetch("/api/notifications/vapid-public-key", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch VAPID key: ${res.statusText}`);
    }
    const data = await res.json();
    return data.publicKey || null;
  } catch (err) {
    console.error("Failed to fetch VAPID public key:", err);
    return null;
  }
}

/**
 * Gets the current Web Push subscription if active.
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.error("Failed to get push subscription:", err);
    return null;
  }
}

/**
 * Subscribes the current device to Web Push notifications.
 */
export async function subscribeToWebPush(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: "Web Push is not supported in this browser/device." };
  }

  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { success: false, error: "Notification permission was denied or not granted." };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { success: false, error: "Failed to obtain VAPID public key from server." };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // If a stale subscription exists from earlier sessions, unsubscribe to ensure fresh VAPID alignment
    if (subscription) {
      await subscription.unsubscribe().catch(() => {});
    }

    const convertedVapidKey = urlBase64ToUint8Array(publicKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey as BufferSource,
    });

    const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || "Failed to register subscription with server." };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to subscribe to Web Push:", err);
    return { success: false, error: err?.message || "Failed to subscribe to Web Push." };
  }
}

/**
 * Resets Service Worker and re-subscribes to Web Push (resolves stale PWA caching issues).
 */
export async function resetPushServiceWorker(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: "Web Push not supported." };
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (sub) {
        await sub.unsubscribe().catch(() => {});
      }
      await reg.unregister().catch(() => {});
    }

    // Re-register fresh service worker
    await navigator.serviceWorker.register("/sw.js?v=" + Date.now());
    await navigator.serviceWorker.ready;

    return await subscribeToWebPush();
  } catch (err: any) {
    console.error("Failed to reset Service Worker:", err);
    return { success: false, error: err?.message || "Reset failed." };
  }
}

/**
 * Unsubscribes the current device from Web Push notifications.
 */
export async function unsubscribeFromWebPush(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: true };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
      await fetch("/api/notifications/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ endpoint }),
      }).catch((e) => console.error("Failed to unregister endpoint from server:", e));
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to unsubscribe from Web Push:", err);
    return { success: false, error: err?.message || "Failed to unsubscribe." };
  }
}

/**
 * Triggers a server-side test Web Push notification to current subscriptions.
 * Supports an optional delay in seconds (defaults to 30s) to allow minimizing the app.
 */
export async function sendServerTestPush(delaySeconds: number = 30): Promise<{
  success: boolean;
  sent?: number;
  delayed?: boolean;
  delaySeconds?: number;
  message?: string;
  error?: string;
}> {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
    const res = await fetch("/api/notifications/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ delaySeconds }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || "Server failed to send test notification." };
    }

    return {
      success: true,
      sent: data.sent,
      delayed: data.delayed,
      delaySeconds: data.delaySeconds,
      message: data.message,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error sending test notification." };
  }
}
