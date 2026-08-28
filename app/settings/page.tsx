"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import { IconLogo, IconRefresh, IconArrowLeft, IconLogout } from "@/components/Icons";
import { requestNotificationPermission, sendNotification } from "@/lib/notification";

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
  const [notificationMessage, setNotificationMessage] = useState("");

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
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

  const handleNotificationSetup = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      setNotificationMessage(
        permission === "denied"
          ? "Notifications are blocked. Allow them in Chrome or macOS notification settings."
          : "Notification permission was not granted.",
      );
      return;
    }

    await sendNotification(
      "Notifications enabled",
      "Arondo will notify you when a task completes.",
      "/tasks",
    );
    setNotificationMessage("Test notification sent.");
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
          {notificationPermission !== "unsupported" && (
            <section
              aria-label="Notification settings"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 16,
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                Notifications
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                Enable task completion notifications or send a test notification.
              </p>
              <button
                type="button"
                onClick={handleNotificationSetup}
                style={{
                  padding: "7px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: notificationPermission === "granted" ? "var(--success)" : "var(--text-primary)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                {notificationPermission === "granted" ? "Test notifications" : "Enable notifications"}
              </button>
              {notificationMessage && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  {notificationMessage}
                </p>
              )}
            </section>
          )}

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
