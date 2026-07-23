"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import { IconArrowLeft, IconLogo, IconInbox, IconRefresh } from "@/components/Icons";

interface AgyQuota {
  Account: string;
  Plan: string;
  DefaultModel: string;
  GeminiWeeklyRemain: number | null;
  GeminiWeeklyResetsAt: number | null;
  GeminiHourRemain: number | null;
  GeminiHourResetsAt: number | null;
  OtherWeeklyRemain: number | null;
  OtherWeeklyResetsAt: number | null;
  OtherHourRemain: number | null;
  OtherHourResetsAt: number | null;
  updatedAt: number | null;
}

interface ClaudeQuota {
  Plan: string;
  Account: string;
  DefaultModel: string;
  HourRemain: number | null;
  HourResetAt: number | null;
  WeekRemain: number | null;
  WeekResetsAt: number | null;
  updatedAt: number | null;
}

interface AgentsQuota {
  claude: ClaudeQuota | null;
  antigravity: AgyQuota | null;
}

interface Runner {
  id: string;
  name: string;
  hostname: string;
  ip?: string;
  os: string;
  arch: string;
  connected: boolean;
  version?: string;
  capabilities?: string[];
  agents?: string[];
  lastSeenAt?: number;
  connectedAt?: number;
  allowedUserTokenUuids?: string[];
}

interface Project {
  id: string;
  repoPath: string;
  runnerId: string;
  createdAt: string;
  updatedAt: string;
}

interface Session {
  id: string;
  name?: string;
  status: string;
  prompt: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

function formatLastSeen(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatTimestamp(ts: number | null): string {
  if (ts == null) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const datePart = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear()
    ? datePart
    : `${d.getFullYear()}-${datePart}`;
}

interface QuotaRow {
  label: string;
  used: number | null;      // 0-1 consumed ratio
  remaining?: number | null; // 0-1 remaining ratio (optional override)
  resetsAt: number | null;
}

function QuotaCard({
  title,
  account,
  plan,
  model,
  updatedAt,
  rows,
}: {
  title: string;
  account: string;
  plan: string;
  model: string;
  updatedAt: number | null;
  rows: QuotaRow[];
}) {
  return (
    <div
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
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {account} · {plan}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{model}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const usedRatio = row.used ?? 0;
          const remainRatio = row.remaining ?? (1 - usedRatio);
          const pct = Math.round(remainRatio * 100);
          const isDisabled = row.used == null && row.remaining == null;
          return (
            <div key={row.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 3,
                }}
              >
                <span>{row.label}</span>
                <span>
                  {isDisabled
                    ? "Disabled"
                    : `${Math.round(remainRatio * 100)}% left · resets ${formatTimestamp(row.resetsAt)}`}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: "var(--bg-secondary)",
                  overflow: "hidden",
                }}
              >
                {!isDisabled && (
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 2,
                      background: pct <= 10 ? "var(--error)" : pct <= 30 ? "var(--warning, #f59e0b)" : "var(--accent)",
                      transition: "width 0.3s ease",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {updatedAt != null && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}>
          Updated {formatTimestamp(updatedAt)}
        </div>
      )}
    </div>
  );
}

export default function RunnersPage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [agentsQuota, setAgentsQuota] = useState<AgentsQuota | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => {
        if (Array.isArray(data)) setRunners(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/auth/verify")
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) setUserRole(data.role);
      })
      .catch(console.error);

    loadRunners();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(console.error);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => {
        if (Array.isArray(data)) setSessions(data);
      })
      .catch(console.error);

    const poll = setInterval(loadRunners, 10_000);
    return () => clearInterval(poll);
  }, [loadRunners]);

  useEffect(() => {
    if (selectedRunnerId) {
      fetch(`/api/agents/info?runnerId=${encodeURIComponent(selectedRunnerId)}`)
        .then((r) => r.json())
        .then((data: AgentsQuota) => setAgentsQuota(data))
        .catch(console.error);
    } else {
      setAgentsQuota(null);
    }
  }, [selectedRunnerId]);

  const handleDeleteRunner = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/runners?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          loadRunners();
          if (selectedRunnerId === id) {
            setSelectedRunnerId(null);
          }
        } else {
          const data = await res.json();
          alert(data.error || "Failed to delete runner");
        }
      } catch (err) {
        console.error("Failed to delete runner:", err);
        alert("An error occurred while deleting the runner");
      }
    },
    [loadRunners, selectedRunnerId],
  );

  const sortedRunners = [...runners].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
  });

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
          Runners
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
              Runners
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              View and manage connected runners.
            </p>
          </div>

          {/* Runners List */}
          <div>
            {sortedRunners.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  minHeight: 160,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <IconInbox />
                <p>No runners found.</p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {sortedRunners.map((r) => {
                  const agentDefs = [
                    { label: "Antigravity CLI", cmd: "agy", comingSoon: false },
                    { label: "Claude Code", cmd: "claude", comingSoon: false },
                    { label: "Codex", cmd: "codex", comingSoon: true },
                    { label: "OpenCode", cmd: "opencode", comingSoon: true },
                  ];
                  const hasAgentInfo = Array.isArray(r.agents);
                  const isSelected = selectedRunnerId === r.id;
                  const rProjects = projects.filter((p) => p.runnerId === r.id);
                  return (
                    <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      <div
                        onClick={() =>
                          setSelectedRunnerId(isSelected ? null : r.id)
                        }
                        style={{
                          padding: 14,
                          background: isSelected
                            ? "var(--bg-surface)"
                            : "var(--bg-elevated)",
                          border: isSelected
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                          borderRadius: isSelected ? "var(--radius-md) var(--radius-md) 0 0" : "var(--radius-md)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          opacity: r.connected ? 1 : 0.6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              className={`task-status-badge ${r.connected ? "running" : "idle"}`}
                            >
                              {r.connected ? "connected" : "disconnected"}
                            </span>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: "var(--text-primary)",
                              }}
                            >
                              {r.name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                              }}
                            >
                              {r.os} ({r.arch})
                            </span>
                            {!r.connected && userRole === "admin" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDialog({
                                    message: `Are you sure you want to delete runner "${r.name}"?`,
                                    onConfirm: async () => {
                                      setConfirmDialog(null);
                                      await handleDeleteRunner(r.id);
                                    },
                                  });
                                }}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: "var(--error, #e74c3c)",
                                  background: "transparent",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius-sm)",
                                  cursor: "pointer",
                                  transition: "all 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "rgba(231, 76, 60, 0.1)";
                                  e.currentTarget.style.borderColor = "var(--error, #e74c3c)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 16,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            marginBottom: hasAgentInfo ? 10 : 0,
                          }}
                        >
                          <span>Host: {r.hostname}</span>
                          {r.ip && <span>IP: {r.ip}</span>}
                          {(r.connectedAt || r.lastSeenAt) && (
                            <span style={{ color: "var(--text-muted)" }}>
                              {r.connected ? "Connected: " : "Last connected: "}
                              {formatLastSeen(r.connectedAt || r.lastSeenAt!)}
                            </span>
                          )}
                        </div>
                        {hasAgentInfo && (
                          <div
                            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                          >
                            {agentDefs.map(({ label, cmd, comingSoon }) => {
                              const installed =
                                !comingSoon && r.agents!.includes(cmd);
                              const tooltipText = comingSoon
                                ? `${label}: Under Development`
                                : installed
                                  ? `${label} is installed`
                                  : `${label} is not installed`;
                              return (
                                <div
                                  key={cmd}
                                  title={tooltipText}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    border: `1px solid ${installed ? "var(--border-accent)" : "var(--border)"}`,
                                    background: installed
                                      ? "var(--accent-glow)"
                                      : "var(--bg-surface)",
                                    opacity: installed ? 1 : 0.5,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: installed
                                        ? "var(--accent)"
                                        : "var(--text-muted)",
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      color: installed
                                        ? "var(--accent)"
                                        : "var(--text-muted)",
                                    }}
                                  >
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Inline detail panel for selected runner */}
                      {isSelected && (
                        <div
                          style={{
                            border: "1px solid var(--accent)",
                            borderTop: "none",
                            borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                            padding: 16,
                            background: "var(--bg-base)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                              gap: 16,
                            }}
                          >
                            {/* System Information */}
                            <div
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-md)",
                                padding: 16,
                              }}
                            >
                              <h3
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  color: "var(--text-secondary)",
                                  marginBottom: 12,
                                }}
                              >
                                System Information
                              </h3>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {[
                                  { label: "Host Name", value: <code style={{ fontSize: 12, color: "var(--text-primary)" }}>{r.hostname || "N/A"}</code> },
                                  { label: "OS / Platform", value: <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{r.os} ({r.arch})</span> },
                                  { label: "IP Address", value: <code style={{ fontSize: 12, color: "var(--text-primary)" }}>{r.ip || "N/A"}</code> },
                                  { label: "Agent Version", value: <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{r.version || "unknown"}</span> },
                                ].map(({ label, value }) => (
                                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
                                    {value}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Capabilities */}
                            <div
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-md)",
                                padding: 16,
                              }}
                            >
                              <h3
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  color: "var(--text-secondary)",
                                  marginBottom: 12,
                                }}
                              >
                                Capabilities
                              </h3>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {r.capabilities && r.capabilities.length > 0 ? (
                                  r.capabilities.map((cap) => (
                                    <span
                                      key={cap}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 500,
                                        color: "var(--accent)",
                                        background: "var(--accent-glow)",
                                        border: "1px solid var(--border-accent)",
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {cap}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                    Standard terminal execution
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Agent Quota */}
                          {agentsQuota && (agentsQuota.claude || agentsQuota.antigravity) && (
                            <div>
                              <h3
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  marginBottom: 12,
                                }}
                              >
                                Agent Quota
                              </h3>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                  gap: 12,
                                }}
                              >
                                {agentsQuota.claude && (
                                  <QuotaCard
                                    title="Claude"
                                    account={agentsQuota.claude.Account}
                                    plan={agentsQuota.claude.Plan}
                                    model={agentsQuota.claude.DefaultModel}
                                    updatedAt={agentsQuota.claude.updatedAt}
                                    rows={[
                                      { label: "Hour", used: agentsQuota.claude.HourRemain == null ? null : 1 - agentsQuota.claude.HourRemain, remaining: agentsQuota.claude.HourRemain, resetsAt: agentsQuota.claude.HourResetAt },
                                      { label: "Week", used: agentsQuota.claude.WeekRemain == null ? null : 1 - agentsQuota.claude.WeekRemain, remaining: agentsQuota.claude.WeekRemain, resetsAt: agentsQuota.claude.WeekResetsAt },
                                    ]}
                                  />
                                )}
                                {agentsQuota.antigravity && (
                                  <QuotaCard
                                    title="Antigravity"
                                    account={agentsQuota.antigravity.Account}
                                    plan={agentsQuota.antigravity.Plan}
                                    model={agentsQuota.antigravity.DefaultModel}
                                    updatedAt={agentsQuota.antigravity.updatedAt}
                                    rows={[
                                      { label: "Gemini Hour", used: agentsQuota.antigravity.GeminiHourRemain == null ? null : 1 - agentsQuota.antigravity.GeminiHourRemain, remaining: agentsQuota.antigravity.GeminiHourRemain, resetsAt: agentsQuota.antigravity.GeminiHourResetsAt },
                                      { label: "Gemini Weekly", used: agentsQuota.antigravity.GeminiWeeklyRemain == null ? null : 1 - agentsQuota.antigravity.GeminiWeeklyRemain, remaining: agentsQuota.antigravity.GeminiWeeklyRemain, resetsAt: agentsQuota.antigravity.GeminiWeeklyResetsAt },
                                      { label: "Other Hour", used: agentsQuota.antigravity.OtherHourRemain == null ? null : 1 - agentsQuota.antigravity.OtherHourRemain, remaining: agentsQuota.antigravity.OtherHourRemain, resetsAt: agentsQuota.antigravity.OtherHourResetsAt },
                                      { label: "Other Weekly", used: agentsQuota.antigravity.OtherWeeklyRemain == null ? null : 1 - agentsQuota.antigravity.OtherWeeklyRemain, remaining: agentsQuota.antigravity.OtherWeeklyRemain, resetsAt: agentsQuota.antigravity.OtherWeeklyResetsAt },
                                    ]}
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Associated Projects */}
                          <div>
                            <h3
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                marginBottom: 12,
                              }}
                            >
                              Associated Projects
                            </h3>
                            {rProjects.length === 0 ? (
                              <div
                                style={{
                                  padding: "40px 16px",
                                  textAlign: "center",
                                  border: "1px dashed var(--border)",
                                  borderRadius: "var(--radius-md)",
                                  color: "var(--text-muted)",
                                  fontSize: 13,
                                }}
                              >
                                No active projects are configured for this runner.
                                <br />
                                Create a new project session selecting this runner.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {rProjects.map((project) => {
                                  const projSessions = sessions.filter((s) => s.projectId === project.id);
                                  const folderName = project.repoPath.split("/").pop() || project.repoPath;
                                  return (
                                    <div
                                      key={project.id}
                                      style={{
                                        background: "var(--bg-surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--radius-md)",
                                        padding: 16,
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <div style={{ minWidth: 0 }}>
                                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{folderName}</h4>
                                          <code style={{ fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>{project.repoPath}</code>
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", gap: 16 }}>
                                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><strong>Sessions:</strong> {projSessions.length} total</span>
                                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><strong>Status:</strong> Active</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
