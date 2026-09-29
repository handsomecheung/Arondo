"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import { IconLogo, IconRefresh, IconArrowLeft, IconLogout } from "@/components/Icons";
import {
  isWebPushSupported,
  getExistingPushSubscription,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  sendServerTestPush,
  resetPushServiceWorker,
} from "@/lib/notification";

export default function SettingsPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    title?: string;
    confirmLabel?: string;
    danger?: boolean;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isPushSupported, setIsPushSupported] = useState<boolean>(true);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
      setIsStandalone(standalone);

      if ("Notification" in window) {
        setNotificationPermission(Notification.permission);
      }
      const supported = isWebPushSupported();
      setIsPushSupported(supported);

      if (supported) {
        getExistingPushSubscription().then((sub) => {
          setIsPushSubscribed(!!sub);
        });
      }
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("arondo_token") : "";
    fetch("/api/auth/verify", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setUserRole(data.role || "user");
        } else {
          router.replace("/login");
        }
      })
      .catch((err) => {
        console.error(err);
        router.replace("/login");
      });
  }, [router]);

  const handleToggleWebPush = async () => {
    setIsPushLoading(true);
    setNotificationMessage("");

    if (isPushSubscribed) {
      const res = await unsubscribeFromWebPush();
      setIsPushLoading(false);
      if (res.success) {
        setIsPushSubscribed(false);
        setNotificationMessage("Web push notifications disabled for this device.");
      } else {
        setNotificationMessage(`Failed to disable push: ${res.error || "Unknown error"}`);
      }
    } else {
      const res = await subscribeToWebPush();
      setIsPushLoading(false);
      if ("Notification" in window) {
        setNotificationPermission(Notification.permission);
      }
      if (res.success) {
        setIsPushSubscribed(true);
        setNotificationMessage("Web push notifications enabled successfully!");
      } else {
        setNotificationMessage(`Failed to enable push: ${res.error || "Unknown error"}`);
      }
    }
  };

  const handleResetPush = async () => {
    setIsPushLoading(true);
    setNotificationMessage("Clearing Service Worker cache & re-subscribing...");
    const res = await resetPushServiceWorker();
    setIsPushLoading(false);
    if (res.success) {
      setIsPushSubscribed(true);
      setNotificationMessage("Service Worker refreshed & Push Notifications re-registered!");
    } else {
      setNotificationMessage(`Failed to reset: ${res.error || "Unknown error"}`);
    }
  };

  const handleSendTestPush = async () => {
    setIsPushLoading(true);
    setNotificationMessage("Scheduling 30s delayed test push...");
    const res = await sendServerTestPush(30);
    setIsPushLoading(false);
    if (res.success) {
      setNotificationMessage(
        "⏳ Test notification will be sent by the server in 30 seconds! You can minimize or close the app now to test background receiving.",
      );
    } else {
      setNotificationMessage(`Failed to send test push: ${res.error || "Unknown error"}`);
    }
  };

  const handleLogout = () => {
    setConfirmDialog({
      message: "Are you sure you want to log out?",
      title: "Log Out",
      confirmLabel: "Log Out",
      danger: false,
      onConfirm: () => {
        setConfirmDialog(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("arondo_token");
        }
        router.replace("/login");
      },
    });
  };

  if (!userRole) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <header className="header">
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            textDecoration: "none",
            flexShrink: 0,
            transition: "all 0.2s ease",
          }}
          title="Back to dashboard"
        >
          <IconArrowLeft />
        </Link>

        <div className="header-logo">
          <IconLogo />
          <span className="header-title">Arondo</span>
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          Settings
        </span>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: "var(--radius-sm)",
            transition: "all 0.2s ease",
            marginLeft: "auto",
          }}
          title="Refresh App"
          aria-label="Refresh application data"
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
        >
          <IconRefresh />
        </button>
      </header>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                marginBottom: 4,
              }}
            >
              Settings
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Manage your preferences and session settings.
            </p>
          </div>

          {/* Notifications Section */}
          <section
            aria-label="Notification settings"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Push Notifications (Web Push)
              </h2>
              {isPushSubscribed ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "var(--success)",
                  }}
                >
                  ● Active on this device
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "3px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                  }}
                >
                  Disabled
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Receive server-driven native push notifications even when the app is in the background or closed.
            </p>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {!isPushSubscribed ? (
                <button
                  type="button"
                  onClick={handleToggleWebPush}
                  disabled={isPushLoading}
                  style={{
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#ffffff",
                    backgroundColor: "var(--accent, #4f46e5)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: isPushLoading ? "not-allowed" : "pointer",
                    opacity: isPushLoading ? 0.7 : 1,
                    transition: "all 0.2s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  {isPushLoading ? "Enabling..." : "Enable Push Notifications"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSendTestPush}
                    disabled={isPushLoading}
                    style={{
                      padding: "9px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#ffffff",
                      backgroundColor: "var(--accent, #4f46e5)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: isPushLoading ? "not-allowed" : "pointer",
                      opacity: isPushLoading ? 0.7 : 1,
                      transition: "all 0.2s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    {isPushLoading ? "Scheduling..." : "Send Test Notification (in 30s)"}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleWebPush}
                    disabled={isPushLoading}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: isPushLoading ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    Disable Push Notifications
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPush}
                    disabled={isPushLoading}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      backgroundColor: "transparent",
                      border: "1px dashed var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: isPushLoading ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                    }}
                    title="Clear old Service Worker cache and re-register push"
                  >
                    Reset & Re-sync
                  </button>
                </>
              )}
            </div>

            {!isPushSupported && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(217, 119, 6, 0.1)",
                  border: "1px solid rgba(217, 119, 6, 0.2)",
                  fontSize: 12,
                  color: "var(--warning)",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ Web Push is not supported in this browser environment. Please ensure you are accessing Arondo over HTTPS or from a supported modern browser (Chrome, Edge, Firefox, or Safari on iOS 16.4+).
              </div>
            )}

            {notificationPermission === "denied" && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  fontSize: 12,
                  color: "var(--error)",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>Notifications Blocked:</strong> Browser permission is currently denied. Please open your browser or device system settings and allow notifications for this site.
              </div>
            )}

            {typeof window !== "undefined" && !isStandalone && /iPhone|iPad|iPod/.test(navigator.userAgent) && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                💡 <strong>iOS / iPadOS Requirement:</strong> Web Push on iOS requires adding Arondo to your Home Screen (Safari Share &rarr; &quot;Add to Home Screen&quot;) and launching it from the Home Screen icon.
              </div>
            )}

            {notificationMessage && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: notificationMessage.startsWith("Failed")
                    ? "rgba(239, 68, 68, 0.1)"
                    : "rgba(34, 197, 94, 0.1)",
                  border: `1px solid ${
                    notificationMessage.startsWith("Failed")
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(34, 197, 94, 0.2)"
                  }`,
                  fontSize: 12,
                  color: notificationMessage.startsWith("Failed")
                    ? "var(--error)"
                    : "var(--success)",
                }}
              >
                {notificationMessage}
              </div>
            )}
          </section>

          {/* Account / Session Section */}
          <section
            aria-label="Account settings"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                Account
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0, lineHeight: 1.5 }}>
                Sign out of your current session on this device.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--error, #e74c3c)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--error, #e74c3c)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <IconLogout /> Log Out
              </button>
            </div>
          </section>
        </div>
      </main>

      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
