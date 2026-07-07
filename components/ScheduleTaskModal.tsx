"use client";

import { useEffect, useState } from "react";
import { IconX, IconClock } from "@/components/Icons";

type TriggerKind = "at" | "afterSession" | "quotaAvailable";
type ActionKind = "sendMessage" | "runScript";

interface ScheduleSession {
  id: string;
  name?: string;
  prompt: string;
  status: string;
  projectId: string;
}

interface ProjectScript {
  name: string;
  command: string;
}

interface Props {
  sessions: ScheduleSession[];
  onClose: () => void;
  onCreated: () => void;
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ScheduleTaskModal({ sessions, onClose, onCreated }: Props) {
  const [sessionId, setSessionId] = useState<string>(sessions[0]?.id || "");
  const [actionKind, setActionKind] = useState<ActionKind>("sendMessage");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("at");
  const [message, setMessage] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDatetimeInputValue(d);
  });
  const [quotaAgentType, setQuotaAgentType] = useState<"" | "claude" | "antigravity">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSession = sessions.find((s) => s.id === sessionId);
  const isSessionRunning = selectedSession?.status === "running";

  useEffect(() => {
    if (triggerKind === "afterSession" && !isSessionRunning) {
      setTriggerKind("at");
    }
  }, [isSessionRunning, triggerKind]);

  useEffect(() => {
    const projectId = selectedSession?.projectId;
    if (!projectId) {
      setScripts([]);
      return;
    }
    fetch(`/api/projects/${projectId}/scripts`)
      .then((res) => res.json())
      .then((list: ProjectScript[]) => {
        setScripts(list);
        if (list.length > 0) setScriptName((prev) => prev || list[0].name);
      })
      .catch(() => setScripts([]));
  }, [selectedSession?.projectId]);

  const handleSubmit = async () => {
    setError(null);
    if (!sessionId) {
      setError("Select a session first.");
      return;
    }
    if (actionKind === "sendMessage" && !message.trim()) {
      setError("Enter a message to send.");
      return;
    }
    if (actionKind === "runScript" && !scriptName) {
      setError("Select a script to run.");
      return;
    }
    if (triggerKind === "at" && new Date(datetime).getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }

    const trigger =
      triggerKind === "at"
        ? { kind: "at" as const, timestamp: new Date(datetime).getTime() }
        : triggerKind === "afterSession"
          ? { kind: "afterSession" as const, sessionId }
          : { kind: "quotaAvailable" as const, agentType: quotaAgentType || undefined };

    const action =
      actionKind === "sendMessage"
        ? { kind: "sendMessage" as const, sessionId, message: message.trim() }
        : { kind: "runScript" as const, sessionId, scriptName };

    setSubmitting(true);
    try {
      const res = await fetch("/api/scheduled-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to schedule task");
        return;
      }
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to schedule task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconClock size={14} strokeWidth={2.5} />
            Schedule Task
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{ color: "var(--error-text, #ff6b6b)", fontSize: 12 }}>{error}</div>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Session
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.prompt || s.id} {s.status === "running" ? "(running)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Action
            <select
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value as ActionKind)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            >
              <option value="sendMessage">Send a message to the agent</option>
              <option value="runScript">Run a project script</option>
            </select>
          </label>

          {actionKind === "sendMessage" ? (
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
              />
            </label>
          ) : (
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Script
              <select
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              >
                {scripts.length === 0 && <option value="">No scripts configured</option>}
                {scripts.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Run when
            <select
              value={triggerKind}
              onChange={(e) => setTriggerKind(e.target.value as TriggerKind)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            >
              <option value="at">At a specific time</option>
              <option value="afterSession" disabled={!isSessionRunning}>
                After the current run finishes{!isSessionRunning ? " (session isn't running)" : ""}
              </option>
              <option value="quotaAvailable">When agent quota is available</option>
            </select>
          </label>

          {triggerKind === "at" && (
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Date & time
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              />
            </label>
          )}

          {triggerKind === "quotaAvailable" && (
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Agent
              <select
                value={quotaAgentType}
                onChange={(e) => setQuotaAgentType(e.target.value as any)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              >
                <option value="">Any agent</option>
                <option value="claude">Claude Code</option>
                <option value="antigravity">Antigravity CLI</option>
              </select>
            </label>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || sessions.length === 0}
            style={{
              marginTop: 4,
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
