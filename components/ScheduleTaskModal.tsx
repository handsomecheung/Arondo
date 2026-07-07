"use client";

import { useEffect, useState } from "react";
import { IconX, IconClock } from "@/components/Icons";

interface ScheduleProject {
  id: string;
  repoPath: string;
}

interface ProjectScript {
  name: string;
  command: string;
}

interface Props {
  projects: ScheduleProject[];
  onClose: () => void;
  onCreated: () => void;
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function projectLabel(p: ScheduleProject): string {
  return p.repoPath.split("/").pop() || p.repoPath;
}

export default function ScheduleTaskModal({ projects, onClose, onCreated }: Props) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || "");
  const [scriptName, setScriptName] = useState("");
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDatetimeInputValue(d);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setScripts([]);
      return;
    }
    fetch(`/api/projects/${projectId}/scripts`)
      .then((res) => res.json())
      .then((list: ProjectScript[]) => {
        setScripts(list);
        setScriptName(list[0]?.name || "");
      })
      .catch(() => setScripts([]));
  }, [projectId]);

  const handleSubmit = async () => {
    setError(null);
    if (!projectId) {
      setError("Select a project first.");
      return;
    }
    if (!scriptName) {
      setError("Select a script to run.");
      return;
    }
    if (new Date(datetime).getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }

    const trigger = { kind: "at" as const, timestamp: new Date(datetime).getTime() };
    const action = { kind: "runScript" as const, projectId, scriptName };

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
            Schedule Script
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
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{projectLabel(p)}</option>
              ))}
            </select>
          </label>

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

          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Date & time
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </label>

          <button
            onClick={handleSubmit}
            disabled={submitting || projects.length === 0}
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
