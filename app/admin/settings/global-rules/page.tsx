"use client";
import type { Runner } from "../settings-data";
import { useState, useEffect, useCallback } from "react";

export default function SettingsPage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [globalRules, setGlobalRules] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  const [saveRulesSuccess, setSaveRulesSuccess] = useState(false);
  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => {
        if (Array.isArray(data)) setRunners(data);
      })
      .catch(console.error);
  }, []);
  const loadGlobalRules = useCallback(() => {
    fetch("/api/global-rules")
      .then((r) => r.json())
      .then((data: { content: string }) => setGlobalRules(data.content || ""))
      .catch(console.error);
  }, []);
  const handleSaveGlobalRules = useCallback(async () => {
    setSavingRules(true);
    setSaveRulesSuccess(false);
    try {
      const res = await fetch("/api/global-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: globalRules }),
      });
      if (res.ok) {
        setSaveRulesSuccess(true);
        setTimeout(() => setSaveRulesSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save global rules:", err);
    } finally {
      setSavingRules(false);
    }
  }, [globalRules]);
  const handleToggleSyncGlobalRules = useCallback(
    async (runnerId: string, syncGlobalRules: boolean) => {
      try {
        const res = await fetch("/api/runners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: runnerId, syncGlobalRules }),
        });
        if (res.ok) {
          setRunners((prev) =>
            prev.map((r) =>
              r.id === runnerId ? { ...r, syncGlobalRules } : r,
            ),
          );
        } else {
          alert("Failed to update global rules sync setting");
        }
      } catch (err) {
        console.error("Failed to save runner global rules sync setting:", err);
      }
    },
    [],
  );
  useEffect(() => {
    loadGlobalRules();
  }, [loadGlobalRules]);
  useEffect(() => {
    loadRunners();
    const poll = setInterval(loadRunners, 10_000);
    return () => clearInterval(poll);
  }, [loadRunners]);

  return (
    <>
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 4,
          }}
        >
          Global Agent Rules
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 12,
          }}
        >
          Define global rules that automatically apply to all AI Agents. These
          will be synced to <code>~/.gemini/GEMINI.md</code> (agy),{" "}
          <code>~/.claude/CLAUDE.md</code> (claude),{" "}
          <code>~/.codex/AGENTS.md</code> (codex), and{" "}
          <code>~/.config/opencode/AGENTS.md</code> (opencode) on the runners.
        </p>

        {runners.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 12,
              padding: 12,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              Sync to runners
            </span>
            {runners.map((r) => {
              const enabled = r.syncGlobalRules !== false;
              return (
                <label
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    padding: "2px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      handleToggleSyncGlobalRules(r.id, e.target.checked)
                    }
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    ({r.hostname})
                  </span>
                  <span
                    className={`task-status-badge ${r.connected ? "running" : "idle"}`}
                  >
                    {r.connected ? "connected" : "disconnected"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <textarea
          value={globalRules}
          onChange={(e) => setGlobalRules(e.target.value)}
          placeholder="# Global Agent Rules&#10;&#10;- Prefer clean code without comments.&#10;- Use bash scripts for system automation."
          style={{
            width: "100%",
            height: 200,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 12,
            fontSize: 13,
            color: "var(--text-primary)",
            fontFamily: "monospace",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 12,
          }}
        />
        {
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSaveGlobalRules}
              disabled={savingRules}
              style={{
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                opacity: savingRules ? 0.5 : 1,
              }}
            >
              {savingRules ? "Saving…" : "Save Rules"}
            </button>
            {saveRulesSuccess && (
              <span
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  fontWeight: 500,
                }}
              >
                ✓ Rules saved and synced successfully!
              </span>
            )}
          </div>
        }
      </div>
    </>
  );
}
