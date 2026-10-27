"use client";

import { useEffect, useState } from "react";

export default function AutomationSessionSetting() {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) throw new Error("Failed to load automation session setting");
        const settings = await response.json();
        if (!disposed) setChecked(settings.showAutomationSessions === true);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    void load();
    return () => { disposed = true; };
  }, []);

  async function save(value: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showAutomationSessions: value }),
      });
      if (!response.ok) throw new Error("Failed to save automation session setting");
      setChecked(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => void save(e.target.checked)} />
        <span>Show automation sessions</span>
      </label>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
        Include automation sessions in lists, search, tasks, and completion notifications.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
