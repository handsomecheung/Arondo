import webpush from "web-push";
import path from "path";
import fs from "fs/promises";
import { getConfigDir } from "./config";
import { withFileLock, writeJsonAtomic } from "./fileLock";

const CONFIG_DIR = getConfigDir();
const WEB_PUSH_CONFIG_FILE = path.join(CONFIG_DIR, "web-push.json");

export interface WebPushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userTokenUuid?: string;
  userAgent?: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface WebPushConfig {
  vapidKeys?: {
    publicKey: string;
    privateKey: string;
  };
  contactEmail?: string;
  subscriptions: WebPushSubscriptionData[];
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

let vapidInitialized = false;

function toVapidSubject(emailOrUrl?: string): string {
  if (!emailOrUrl) return "mailto:admin@arondo.local";
  const trimmed = emailOrUrl.trim();
  if (!trimmed) return "mailto:admin@arondo.local";
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return `mailto:${trimmed}`;
}

function normalizeStoredContactEmail(emailOrUrl?: string): string {
  if (!emailOrUrl) return "admin@arondo.local";
  let trimmed = emailOrUrl.trim();
  if (trimmed.startsWith("mailto:")) {
    trimmed = trimmed.substring("mailto:".length).trim();
  }
  return trimmed || "admin@arondo.local";
}

async function loadWebPushConfig(): Promise<WebPushConfig> {
  try {
    const raw = await fs.readFile(WEB_PUSH_CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      vapidKeys: data.vapidKeys,
      contactEmail: normalizeStoredContactEmail(data.contactEmail),
      subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
    };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {
        contactEmail: "admin@arondo.local",
        subscriptions: [],
      };
    }
    console.error("[web-push] Failed to read web-push.json:", err);
    return {
      contactEmail: "admin@arondo.local",
      subscriptions: [],
    };
  }
}

async function saveWebPushConfig(config: WebPushConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await withFileLock(WEB_PUSH_CONFIG_FILE, async () => {
    await writeJsonAtomic(WEB_PUSH_CONFIG_FILE, config);
  });
}

export async function ensureVapidDetails(): Promise<{ publicKey: string; privateKey: string }> {
  const config = await loadWebPushConfig();
  if (config.vapidKeys?.publicKey && config.vapidKeys?.privateKey) {
    if (!vapidInitialized) {
      webpush.setVapidDetails(
        toVapidSubject(config.contactEmail),
        config.vapidKeys.publicKey,
        config.vapidKeys.privateKey,
      );
      vapidInitialized = true;
    }
    return config.vapidKeys;
  }

  // Generate new VAPID keys
  const keys = webpush.generateVAPIDKeys();
  config.vapidKeys = keys;
  await saveWebPushConfig(config);

  webpush.setVapidDetails(
    toVapidSubject(config.contactEmail),
    keys.publicKey,
    keys.privateKey,
  );
  vapidInitialized = true;
  return keys;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await ensureVapidDetails();
  return keys.publicKey;
}

export async function getWebPushContactEmail(): Promise<string> {
  const config = await loadWebPushConfig();
  return normalizeStoredContactEmail(config.contactEmail);
}

export async function updateWebPushContactEmail(contactEmail: string): Promise<string> {
  const stored = normalizeStoredContactEmail(contactEmail);

  const config = await loadWebPushConfig();
  config.contactEmail = stored;
  await saveWebPushConfig(config);

  if (config.vapidKeys?.publicKey && config.vapidKeys?.privateKey) {
    webpush.setVapidDetails(
      toVapidSubject(stored),
      config.vapidKeys.publicKey,
      config.vapidKeys.privateKey,
    );
    vapidInitialized = true;
  }

  return stored;
}

export async function registerPushSubscription(
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  userTokenUuid?: string,
  userAgent?: string,
): Promise<void> {
  await ensureVapidDetails();

  const config = await loadWebPushConfig();
  const existingIdx = config.subscriptions.findIndex(
    (s) => s.endpoint === subscription.endpoint,
  );

  const entry: WebPushSubscriptionData = {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userTokenUuid,
    userAgent,
    createdAt: existingIdx >= 0 ? config.subscriptions[existingIdx].createdAt : Date.now(),
    lastUsedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    config.subscriptions[existingIdx] = entry;
  } else {
    config.subscriptions.push(entry);
  }

  await saveWebPushConfig(config);
}

export async function unregisterPushSubscription(endpoint: string): Promise<boolean> {
  const config = await loadWebPushConfig();
  const initialLen = config.subscriptions.length;
  config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== endpoint);

  if (config.subscriptions.length !== initialLen) {
    await saveWebPushConfig(config);
    return true;
  }
  return false;
}

export async function sendWebPushNotification(
  payload: WebPushPayload,
  targetUserTokenUuid?: string,
): Promise<{ sent: number; failed: number }> {
  await ensureVapidDetails();
  const config = await loadWebPushConfig();

  let targetSubs = config.subscriptions;
  if (targetUserTokenUuid) {
    targetSubs = targetSubs.filter(
      (s) => !s.userTokenUuid || s.userTokenUuid === targetUserTokenUuid,
    );
  }

  if (targetSubs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-96.png",
    tag: payload.tag,
    data: payload.data,
  });

  const expiredEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    targetSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          },
          notificationPayload,
          {
            TTL: 60 * 60 * 24, // 24 hours
            urgency: "high",
          },
        );
        sent++;
      } catch (err: any) {
        failed++;
        console.error(`[web-push] Failed to send push to ${sub.endpoint}:`, err?.statusCode || err?.message);
        // 404 Not Found or 410 Gone indicates the subscription has expired or is invalid
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  // Clean up expired subscriptions if any
  if (expiredEndpoints.length > 0) {
    const nextConfig = await loadWebPushConfig();
    nextConfig.subscriptions = nextConfig.subscriptions.filter(
      (s) => !expiredEndpoints.includes(s.endpoint),
    );
    await saveWebPushConfig(nextConfig);
  }

  return { sent, failed };
}
