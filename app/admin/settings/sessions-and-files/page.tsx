"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import AutomationSessionSetting from "@/components/AutomationSessionSetting";
import type { AdminSettingsData } from "../settings-data";

export default function SettingsPage() {
  const [sessionArchiveDays, setSessionArchiveDays] = useState<number | "">("");
  const sessionArchiveDaysAutoSaveReady = useRef(false);
  const [automationSessionRetentionHours, setAutomationSessionRetentionHours] =
    useState<number | "">("");
  const automationSessionRetentionHoursAutoSaveReady = useRef(false);
  const [showHiddenFiles, setShowHiddenFiles] = useState(true);
  const [savingShowHiddenFiles, setSavingShowHiddenFiles] = useState(false);
  const saveSessionArchiveDays = useCallback(async (days: number) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionArchiveDays: days }),
      });
      if (!res.ok) {
        alert("Failed to save session archive days");
      }
    } catch (err) {
      console.error("Failed to save session archive days:", err);
    }
  }, []);
  const saveAutomationSessionRetentionHours = useCallback(
    async (hours: number) => {
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ automationSessionRetentionHours: hours }),
        });
        if (!res.ok) {
          alert("Failed to save automation session retention hours");
        }
      } catch (err) {
        console.error(
          "Failed to save automation session retention hours:",
          err,
        );
      }
    },
    [],
  );
  const handleToggleShowHiddenFiles = useCallback(async (checked: boolean) => {
    setShowHiddenFiles(checked);
    setSavingShowHiddenFiles(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showHiddenFiles: checked }),
      });
      if (!res.ok) {
        setShowHiddenFiles(!checked);
        alert("Failed to save hidden files setting");
      }
    } catch (err) {
      console.error("Failed to save hidden files setting:", err);
      setShowHiddenFiles(!checked);
    } finally {
      setSavingShowHiddenFiles(false);
    }
  }, []);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AdminSettingsData) => {
        setSessionArchiveDays(data.sessionArchiveDays);
        setAutomationSessionRetentionHours(
          data.automationSessionRetentionHours,
        );
        if (data.showHiddenFiles !== undefined)
          setShowHiddenFiles(data.showHiddenFiles);
      })
      .catch(console.error);
  }, []);
  useEffect(() => {
    if (sessionArchiveDays === "" || sessionArchiveDays < 1) return;

    if (!sessionArchiveDaysAutoSaveReady.current) {
      sessionArchiveDaysAutoSaveReady.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      saveSessionArchiveDays(sessionArchiveDays);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [sessionArchiveDays, saveSessionArchiveDays]);
  useEffect(() => {
    if (
      automationSessionRetentionHours === "" ||
      automationSessionRetentionHours <= 0
    )
      return;

    if (!automationSessionRetentionHoursAutoSaveReady.current) {
      automationSessionRetentionHoursAutoSaveReady.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      saveAutomationSessionRetentionHours(automationSessionRetentionHours);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [automationSessionRetentionHours, saveAutomationSessionRetentionHours]);
  return (
    <>
      <section
        aria-label="Session and file settings"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
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
            Session Management
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Number of idle days before an active session is automatically
            archived.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <input
              type="number"
              min={1}
              value={sessionArchiveDays}
              onChange={(e) =>
                setSessionArchiveDays(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              style={{
                width: 100,
                padding: "7px 10px",
                fontSize: 13,
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Number of hours automation sessions are retained before cleanup.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <input
              type="number"
              min={0.01}
              step="any"
              value={automationSessionRetentionHours}
              onChange={(e) =>
                setAutomationSessionRetentionHours(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              style={{
                width: 100,
                padding: "7px 10px",
                fontSize: 13,
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <AutomationSessionSetting />
        </div>

        <div
          style={{
            height: 1,
            background: "var(--border)",
          }}
        />

        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            File Browser
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Show hidden files and directories (e.g. .env, .git) in the file
            browser and @ path selector.
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-primary)",
              cursor: savingShowHiddenFiles ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showHiddenFiles}
              disabled={savingShowHiddenFiles}
              onChange={(e) => handleToggleShowHiddenFiles(e.target.checked)}
              style={{ cursor: savingShowHiddenFiles ? "default" : "pointer" }}
            />
            <span>Show hidden files</span>
          </label>
        </div>
      </section>
    </>
  );
}
