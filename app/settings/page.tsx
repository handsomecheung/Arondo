"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AgyQuota {
  Account: string;
  Plan: string;
  DefaultModel: string;
  GeminiWeeklyRemain: number | null;
  GeminiWeeklyResetsAt: number | null;
  GeminiFiveHourRemain: number | null;
  GeminiFiveHourResetsAt: number | null;
  OtherWeeklyRemain: number | null;
  OtherWeeklyResetsAt: number | null;
  OtherFiveHourRemain: number | null;
  OtherFiveHourResetsAt: number | null;
  updatedAt: number | null;
}

interface ClaudeQuota {
  Plan: string;
  Account: string;
  DefaultModel: string;
  SessionUsed: number | null;
  SessionResetAt: number | null;
  WeekUsed: number | null;
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

interface AgentCommand {
  command: string;
  menuLabel?: string;
  menuDescription?: string;
  matcher?: string;
  send: string;
}

const EMPTY_COMMAND: AgentCommand = {
  command: "",
  menuLabel: "",
  menuDescription: "",
  matcher: "",
  send: "",
};

const COMMAND_FIELDS: {
  key: keyof AgentCommand;
  label: string;
  placeholder: string;
  hint?: string;
}[] = [
  {
    key: "command",
    label: "Command *",
    placeholder: "e.g. commit message",
    hint: 'e.g. "commit message"',
  },
  {
    key: "send",
    label: "Send *",
    placeholder: "Message to send to the agent",
    hint: 'Use $1, $2, … to insert Matcher capture groups. e.g. "commit the changes with message: $1."',
  },
  {
    key: "menuLabel",
    label: "Menu Label",
    placeholder: "e.g. /commit <message>",
    hint: "e.g. /commit <message>",
  },
  {
    key: "menuDescription",
    label: "Menu Description",
    placeholder: "Short description shown in the menu",
    hint: 'e.g. "Commit the changes with a specific message"',
  },
  {
    key: "matcher",
    label: "Matcher (regex)",
    placeholder: "e.g. ^commit\\s+(.+)$",
    hint: 'Wrap capture groups in parentheses ( ) — they become $1, $2, … in Send. e.g. "^commit\\s+(.+)$ captures the message as $1"',
  },
];

function IconArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
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

function formatResetsAt(ts: number | null): string {
  if (ts == null) return "—";
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
                    : `${Math.round(remainRatio * 100)}% left · resets ${formatResetsAt(row.resetsAt)}`}
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
          Updated {formatResetsAt(updatedAt)} ago
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);
  const [customCommands, setCustomCommands] = useState<AgentCommand[]>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [newCommand, setNewCommand] = useState<AgentCommand>(EMPTY_COMMAND);
  const [savingCommand, setSavingCommand] = useState(false);
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AgentCommand>(EMPTY_COMMAND);

  const [agentsQuota, setAgentsQuota] = useState<AgentsQuota | null>(null);

  const [globalRules, setGlobalRules] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  const [saveRulesSuccess, setSaveRulesSuccess] = useState(false);

  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => setRunners(data))
      .catch(console.error);
  }, []);

  const loadCustomCommands = useCallback(() => {
    fetch("/api/agent-commands?source=custom")
      .then((r) => r.json())
      .then((data: AgentCommand[]) => setCustomCommands(data))
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

  useEffect(() => {
    loadRunners();
    loadCustomCommands();
    loadGlobalRules();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
      .catch(console.error);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => setSessions(data))
      .catch(console.error);

    if (selectedRunnerId) {
      fetch(`/api/agents/info?runnerId=${encodeURIComponent(selectedRunnerId)}`)
        .then((r) => r.json())
        .then((data: AgentsQuota) => setAgentsQuota(data))
        .catch(console.error);
    } else {
      setAgentsQuota(null);
    }

    const poll = setInterval(loadRunners, 10_000);
    return () => clearInterval(poll);
  }, [loadRunners, loadCustomCommands, selectedRunnerId]);

  const handleDeleteCommand = useCallback(
    async (command: string) => {
      await fetch(
        `/api/agent-commands?command=${encodeURIComponent(command)}`,
        { method: "DELETE" },
      );
      loadCustomCommands();
    },
    [loadCustomCommands],
  );

  const buildCommandBody = (draft: AgentCommand): AgentCommand => {
    const body: AgentCommand = {
      command: draft.command.trim(),
      send: draft.send.trim(),
    };
    if (draft.menuLabel?.trim()) body.menuLabel = draft.menuLabel.trim();
    if (draft.menuDescription?.trim())
      body.menuDescription = draft.menuDescription.trim();
    if (draft.matcher?.trim()) body.matcher = draft.matcher.trim();
    return body;
  };

  const handleAddCommand = useCallback(async () => {
    if (!newCommand.command.trim() || !newCommand.send.trim()) return;
    setSavingCommand(true);
    try {
      await fetch("/api/agent-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCommandBody(newCommand)),
      });
      setNewCommand(EMPTY_COMMAND);
      setShowAddCommand(false);
      loadCustomCommands();
    } finally {
      setSavingCommand(false);
    }
  }, [newCommand, loadCustomCommands]);

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft.command.trim() || !editDraft.send.trim()) return;
    setSavingCommand(true);
    try {
      await fetch("/api/agent-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCommandBody(editDraft)),
      });
      setEditingCommand(null);
      loadCustomCommands();
    } finally {
      setSavingCommand(false);
    }
  }, [editDraft, loadCustomCommands]);

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
          <IconBolt />
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
              Manage your Arondo configuration.
            </p>
          </div>

          {/* Nodes Section */}
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 12,
              }}
            >
              Nodes
            </h2>

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
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                            }}
                          >
                            {r.os} ({r.arch})
                          </span>
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
                          {!r.connected && r.lastSeenAt && (
                            <span style={{ color: "var(--text-muted)" }}>
                              Last seen: {formatLastSeen(r.lastSeenAt)}
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
                                      { label: "Session", used: agentsQuota.claude.SessionUsed, resetsAt: agentsQuota.claude.SessionResetAt },
                                      { label: "Week", used: agentsQuota.claude.WeekUsed, resetsAt: agentsQuota.claude.WeekResetsAt },
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
                                      { label: "Gemini Weekly", used: agentsQuota.antigravity.GeminiWeeklyRemain == null ? null : 1 - agentsQuota.antigravity.GeminiWeeklyRemain, remaining: agentsQuota.antigravity.GeminiWeeklyRemain, resetsAt: agentsQuota.antigravity.GeminiWeeklyResetsAt },
                                      { label: "Gemini 5h", used: agentsQuota.antigravity.GeminiFiveHourRemain == null ? null : 1 - agentsQuota.antigravity.GeminiFiveHourRemain, remaining: agentsQuota.antigravity.GeminiFiveHourRemain, resetsAt: agentsQuota.antigravity.GeminiFiveHourResetsAt },
                                      { label: "Other Weekly", used: agentsQuota.antigravity.OtherWeeklyRemain == null ? null : 1 - agentsQuota.antigravity.OtherWeeklyRemain, remaining: agentsQuota.antigravity.OtherWeeklyRemain, resetsAt: agentsQuota.antigravity.OtherWeeklyResetsAt },
                                      { label: "Other 5h", used: agentsQuota.antigravity.OtherFiveHourRemain == null ? null : 1 - agentsQuota.antigravity.OtherFiveHourRemain, remaining: agentsQuota.antigravity.OtherFiveHourRemain, resetsAt: agentsQuota.antigravity.OtherFiveHourResetsAt },
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
                                No active projects are configured for this node.
                                <br />
                                Create a new project session selecting this runner node.
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
                                        <div>
                                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{folderName}</h4>
                                          <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.repoPath}</code>
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

          {/* Agent Commands Section */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Agent Commands
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  Custom slash commands that expand into agent instructions.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddCommand(true);
                  setNewCommand(EMPTY_COMMAND);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--accent)",
                  background: "var(--accent-glow)",
                  border: "1px solid var(--border-accent)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                + Add
              </button>
            </div>

            {showAddCommand && (
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-accent)",
                  borderRadius: "var(--radius-md)",
                  padding: 16,
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 2,
                  }}
                >
                  New Command
                </h3>
                {COMMAND_FIELDS.map(({ key, label, placeholder, hint }) => (
                  <div
                    key={key}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      {label}
                    </label>
                    <input
                      value={(newCommand[key] as string) ?? ""}
                      onChange={(e) =>
                        setNewCommand((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={placeholder}
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "7px 10px",
                        fontSize: 13,
                        color: "var(--text-primary)",
                        fontFamily:
                          key === "matcher" || key === "send"
                            ? "monospace"
                            : "inherit",
                        outline: "none",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                    {hint && (
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                      >
                        {hint}
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handleAddCommand}
                    disabled={
                      savingCommand ||
                      !newCommand.command.trim() ||
                      !newCommand.send.trim()
                    }
                    style={{
                      padding: "7px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      opacity:
                        savingCommand ||
                        !newCommand.command.trim() ||
                        !newCommand.send.trim()
                          ? 0.5
                          : 1,
                    }}
                  >
                    {savingCommand ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setShowAddCommand(false)}
                    style={{
                      padding: "7px 14px",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customCommands.length === 0 && !showAddCommand && (
                <div
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    border: "1px dashed var(--border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  No custom commands. Click "+ Add" to create one.
                </div>
              )}
              {customCommands.map((cmd) =>
                editingCommand === cmd.command ? (
                  <div
                    key={cmd.command}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-accent)",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 2,
                      }}
                    >
                      Edit Command
                    </h3>
                    {COMMAND_FIELDS.map(({ key, label, placeholder, hint }) => (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontWeight: 500,
                          }}
                        >
                          {label}
                        </label>
                        <input
                          value={(editDraft[key] as string) ?? ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder={placeholder}
                          style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "7px 10px",
                            fontSize: 13,
                            color: "var(--text-primary)",
                            fontFamily:
                              key === "matcher" || key === "send"
                                ? "monospace"
                                : "inherit",
                            outline: "none",
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        />
                        {hint && (
                          <span
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {hint}
                          </span>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={handleSaveEdit}
                        disabled={
                          savingCommand ||
                          !editDraft.command.trim() ||
                          !editDraft.send.trim()
                        }
                        style={{
                          padding: "7px 18px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#fff",
                          background: "var(--accent)",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          opacity:
                            savingCommand ||
                            !editDraft.command.trim() ||
                            !editDraft.send.trim()
                              ? 0.5
                              : 1,
                        }}
                      >
                        {savingCommand ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingCommand(null)}
                        style={{
                          padding: "7px 14px",
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={cmd.command}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: 14,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <code
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--accent)",
                            background: "var(--accent-glow)",
                            border: "1px solid var(--border-accent)",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          /{cmd.command}
                        </code>
                        {cmd.menuDescription && (
                          <span
                            style={{ fontSize: 12, color: "var(--text-muted)" }}
                          >
                            {cmd.menuDescription}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          fontFamily: "monospace",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={cmd.send}
                      >
                        {cmd.send}
                      </div>
                      {cmd.matcher && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                            marginTop: 2,
                          }}
                        >
                          matcher: {cmd.matcher}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setEditingCommand(cmd.command);
                          setEditDraft({ ...cmd });
                        }}
                        title="Edit command"
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCommand(cmd.command)}
                        title="Delete command"
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          color: "var(--error, #e74c3c)",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Global Agent Rules Section */}
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
              Define global rules that automatically apply to all AI Agents.
              These will be synced to <code>~/.gemini/GEMINI.md</code> (agy) and <code>~/.claude/CLAUDE.md</code> (claude) on the runner nodes.
            </p>
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
                <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>
                  ✓ Rules saved and synced successfully!
                </span>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
