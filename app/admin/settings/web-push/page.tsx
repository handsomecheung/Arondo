"use client";
import { useState, useEffect, useCallback } from "react";
import type { AdminSettingsData } from "../settings-data";

export default function SettingsPage() {
  const [webPushContactEmail, setWebPushContactEmail] = useState("");
  const [savingWebPushContactEmail, setSavingWebPushContactEmail] =
    useState(false);
  const [webPushContactEmailSaved, setWebPushContactEmailSaved] =
    useState(false);
  const handleSaveWebPushContactEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingWebPushContactEmail(true);
      setWebPushContactEmailSaved(false);
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webPushContactEmail }),
        });
        if (!res.ok) {
          alert("Failed to save Web Push contact email");
          return;
        }
        setWebPushContactEmailSaved(true);
        setTimeout(() => setWebPushContactEmailSaved(false), 3000);
      } catch (err) {
        console.error("Failed to save Web Push contact email:", err);
        alert("Failed to save Web Push contact email");
      } finally {
        setSavingWebPushContactEmail(false);
      }
    },
    [webPushContactEmail],
  );
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AdminSettingsData) => {
        if (data.webPushContactEmail !== undefined)
          setWebPushContactEmail(data.webPushContactEmail);
      })
      .catch(console.error);
  }, []);

  return (
    <>
      <section
        aria-label="Web Push VAPID settings"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            Web Push Notification (VAPID Contact Email)
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            The contact email or URL included in the VAPID <code>sub</code>{" "}
            claim sent to Web Push notification gateways (Apple, Google,
            Mozilla). Required by push services so operators can reach the
            administrator if delivery anomalies occur. Persisted to{" "}
            <code>~/.arondo/web-push.json</code>.
          </p>
        </div>

        <form
          onSubmit={handleSaveWebPushContactEmail}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 8,
              alignItems: "end",
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                Admin Contact Email
              </span>
              <input
                type="text"
                value={webPushContactEmail}
                placeholder="e.g. admin@example.com"
                onChange={(e) => setWebPushContactEmail(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "7px 10px",
                  fontSize: 13,
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              disabled={savingWebPushContactEmail}
              style={{
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: savingWebPushContactEmail ? "not-allowed" : "pointer",
                opacity: savingWebPushContactEmail ? 0.5 : 1,
              }}
            >
              {savingWebPushContactEmail ? "Saving…" : "Save Contact Email"}
            </button>
            {webPushContactEmailSaved && (
              <span
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  fontWeight: 500,
                }}
              >
                Saved
              </span>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
