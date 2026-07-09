"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/modals/ConfirmDialog";

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

interface AgentCommand {
  command: string;
  menuLabel?: string;
  menuDescription?: string;
  matcher?: string;
  send: string;
}

interface TokenInfo {
  token: string;
  uuid: string;
  name: string;
  type: "admin" | "user";
}

interface RunnerTokenInfo {
  id: string;
  token: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
  boundRunnerId?: string | null;
  runnerName?: string;
  connected?: boolean;
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

export default function SettingsPage() {
  const router = useRouter();
  const [runners, setRunners] = useState<Runner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [customCommands, setCustomCommands] = useState<AgentCommand[]>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [newCommand, setNewCommand] = useState<AgentCommand>(EMPTY_COMMAND);
  const [savingCommand, setSavingCommand] = useState(false);
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AgentCommand>(EMPTY_COMMAND);
  const [newTokenMap, setNewTokenMap] = useState<Record<string, string>>({});
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [systemTokens, setSystemTokens] = useState<TokenInfo[]>([]);
  const [generatedUserToken, setGeneratedUserToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [editingTokenKey, setEditingTokenKey] = useState<string | null>(null);
  const [editingTokenName, setEditingTokenName] = useState("");

  const [runnerTokens, setRunnerTokens] = useState<RunnerTokenInfo[]>([]);
  const [generatedRunnerToken, setGeneratedRunnerToken] = useState<string | null>(null);
  const [generatingRunnerToken, setGeneratingRunnerToken] = useState(false);
  const [runnerTokenCopied, setRunnerTokenCopied] = useState(false);
  const [newRunnerTokenName, setNewRunnerTokenName] = useState("");
  const [editingRunnerTokenId, setEditingRunnerTokenId] = useState<string | null>(null);
  const [editingRunnerTokenName, setEditingRunnerTokenName] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

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

  const loadSystemTokens = useCallback(() => {
    fetch("/api/auth/client-tokens")
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data) setSystemTokens(data);
      })
      .catch(console.error);
  }, []);

  const loadRunnerTokens = useCallback(() => {
    fetch("/api/auth/runner-tokens")
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data) setRunnerTokens(data);
      })
      .catch(console.error);
  }, []);

  const handleGenerateUserToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    setGeneratingToken(true);
    setGeneratedUserToken(null);
    try {
      const res = await fetch("/api/auth/client-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedUserToken(data.token);
        setNewTokenName("");
        loadSystemTokens();
      } else {
        alert("Failed to generate user token");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while generating token");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleRenameToken = async (role: "admin" | "user", tokenKey: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/auth/client-tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, token: tokenKey, name: newName.trim() }),
      });
      if (res.ok) {
        setEditingTokenKey(null);
        loadSystemTokens();
      } else {
        alert("Failed to update token name");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUserToken = (tokenKey: string, name: string) => {
    setConfirmDialog({
      message: `Are you sure you want to delete the user token for "${name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/auth/client-tokens?role=user&token=${encodeURIComponent(tokenKey)}`, {
            method: "DELETE"
          });
          if (res.ok) {
            loadSystemTokens();
          }
        } catch (err) {
          console.error("Failed to delete token:", err);
        }
      }
    });
  };

  const handleGenerateRunnerToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunnerTokenName.trim()) return;

    setGeneratingRunnerToken(true);
    setGeneratedRunnerToken(null);
    try {
      const res = await fetch("/api/auth/runner-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRunnerTokenName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedRunnerToken(data.token);
        setNewRunnerTokenName("");
        loadRunnerTokens();
      } else {
        alert("Failed to generate runner token");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while generating runner token");
    } finally {
      setGeneratingRunnerToken(false);
    }
  };

  const handleRenameRunnerToken = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/auth/runner-tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName.trim() }),
      });
      if (res.ok) {
        setEditingRunnerTokenId(null);
        loadRunnerTokens();
      } else {
        alert("Failed to update runner token name");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRunnerToken = (id: string, name: string) => {
    setConfirmDialog({
      message: `Are you sure you want to delete the runner token for "${name}"? If a runner is currently connected with it, it will be disconnected immediately.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/auth/runner-tokens?id=${encodeURIComponent(id)}`, {
            method: "DELETE"
          });
          if (res.ok) {
            loadRunnerTokens();
          }
        } catch (err) {
          console.error("Failed to delete runner token:", err);
        }
      }
    });
  };

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

  const saveRunnerUserTokenUuids = useCallback(async (runnerId: string, allowedUserTokenUuids: string[]) => {
    try {
      const res = await fetch("/api/runners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runnerId, allowedUserTokenUuids }),
      });
      if (res.ok) {
        setRunners((prev) => prev.map((r) => (r.id === runnerId ? { ...r, allowedUserTokenUuids } : r)));
      } else {
        alert("Failed to update allowed tokens");
      }
    } catch (err) {
      console.error("Failed to save runner tokens:", err);
    }
  }, []);

  const handleAddToken = useCallback(async (runnerId: string) => {
    const tokenToAdd = newTokenMap[runnerId]?.trim();
    if (!tokenToAdd) return;

    const runner = runners.find((r) => r.id === runnerId);
    if (!runner) return;

    const currentTokenUuids = runner.allowedUserTokenUuids || [];
    if (currentTokenUuids.includes(tokenToAdd)) return;

    const updatedTokenUuids = [...currentTokenUuids, tokenToAdd];
    await saveRunnerUserTokenUuids(runnerId, updatedTokenUuids);
  }, [newTokenMap, runners, saveRunnerUserTokenUuids]);

  const handleRemoveToken = useCallback(async (runnerId: string, tokenToRemove: string) => {
    const runner = runners.find((r) => r.id === runnerId);
    if (!runner) return;

    const currentTokenUuids = runner.allowedUserTokenUuids || [];
    const updatedTokenUuids = currentTokenUuids.filter((t) => t !== tokenToRemove);
    await saveRunnerUserTokenUuids(runnerId, updatedTokenUuids);
  }, [runners, saveRunnerUserTokenUuids]);

  useEffect(() => {
    if (userRole === "admin") {
      loadSystemTokens();
      loadRunnerTokens();
    }
  }, [userRole, loadSystemTokens, loadRunnerTokens]);

  useEffect(() => {
    fetch("/api/auth/verify")
      .then((r) => r.json())
      .then((data) => {
        if (data.valid && data.role === "admin") {
          setUserRole(data.role);
        } else {
          router.replace("/");
        }
      })
      .catch((err) => {
        console.error(err);
        router.replace("/");
      });

    loadRunners();
    loadCustomCommands();
    loadGlobalRules();
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
  }, [loadRunners, loadCustomCommands]);

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

  if (userRole !== "admin") {
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
        <button
          onClick={() => {
            if (confirm("Are you sure you want to reset your access token?")) {
              localStorage.removeItem("arondo_token");
              window.location.reload();
            }
          }}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          Reset Token
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
              Manage your Arondo configuration.
            </p>
          </div>

          {/* Runner Access Control Section */}
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              Runner Access Control
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Configure which users (by access tokens) are allowed to access each runner. If no users are selected, the runner allows public access.
            </p>

            {runners.length === 0 ? (
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
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {runners.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 14,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span className={`task-status-badge ${r.connected ? "running" : "idle"}`}>
                        {r.connected ? "connected" : "disconnected"}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        ({r.hostname})
                      </span>
                    </div>
                    <div>
                      {userRole === "admin" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                          {systemTokens.filter(t => t.type === "user").length === 0 ? (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                              No user tokens configured. Go to Token Manager below to create one.
                            </span>
                          ) : (
                            systemTokens.filter(t => t.type === "user").map(({ token: tokenKey, uuid: tokenUuid, name, type }) => {
                              const isAllowed = (r.allowedUserTokenUuids || []).includes(tokenUuid);
                              const isUserToken = type === "user";
                              const masked = tokenKey.substring(0, 3) + "...";
                              return (
                                <label
                                  key={tokenUuid}
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
                                    checked={isAllowed}
                                    onChange={async (e) => {
                                      const current = r.allowedUserTokenUuids || [];
                                      let updated: string[];
                                      if (e.target.checked) {
                                        updated = [...current, tokenUuid];
                                      } else {
                                        updated = current.filter((t) => t !== tokenUuid);
                                      }
                                      await saveRunnerUserTokenUuids(r.id, updated);
                                    }}
                                    style={{ cursor: "pointer" }}
                                  />
                                  <span style={{ fontWeight: 500 }}>{name}</span>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                    ({isUserToken ? "User" : "Admin"}: {masked})
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 24, alignItems: "center" }}>
                          {!r.allowedUserTokenUuids || r.allowedUserTokenUuids.length === 0 ? (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                              Public access (No tokens configured)
                            </span>
                          ) : (
                            r.allowedUserTokenUuids.map((tokenUuid) => {
                              const name = systemTokens.find(t => t.uuid === tokenUuid)?.name || tokenUuid.substring(0, 9) + "...";
                              return (
                                <span
                                  key={tokenUuid}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    fontSize: 11,
                                    background: "var(--bg-elevated)",
                                    border: "1px solid var(--border)",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {name}
                                </span>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
              {userRole === "admin" && (
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
              )}
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
                    {userRole === "admin" && (
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
                          onClick={() => {
                            setConfirmDialog({
                              message: `Are you sure you want to delete the agent command "/${cmd.command}"?`,
                              onConfirm: async () => {
                                setConfirmDialog(null);
                                await handleDeleteCommand(cmd.command);
                              },
                            });
                          }}
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
                    )}
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
              These will be synced to <code>~/.gemini/GEMINI.md</code> (agy) and <code>~/.claude/CLAUDE.md</code> (claude) on the runners.
            </p>
            <textarea
              value={globalRules}
              onChange={(e) => setGlobalRules(e.target.value)}
              readOnly={false}
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
            {userRole === "admin" && (
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
            )}
          </div>

          {/* System Access Tokens Section (Only for Admin) */}
          {userRole === "admin" && (
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
                System Access Tokens
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                Manage system-wide access tokens. For security, existing tokens are only partially shown.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                    Admin Tokens (Name / Token)
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {systemTokens.filter(t => t.type === "admin").map(({ token: tokenKey, name }) => {
                      const isEditing = editingTokenKey === tokenKey;
                      const masked = tokenKey.substring(0, 3) + "...";
                      return (
                        <div
                          key={tokenKey}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            padding: "6px 12px",
                            borderRadius: "6px",
                          }}
                        >
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0 }}>
                            {masked}
                          </span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingTokenName}
                              onChange={(e) => setEditingTokenName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameToken("admin", tokenKey, editingTokenName);
                                } else if (e.key === "Escape") {
                                  setEditingTokenKey(null);
                                }
                              }}
                              autoFocus
                              style={{
                                flex: 1,
                                padding: "2px 6px",
                                fontSize: 12,
                                backgroundColor: "var(--bg-base)",
                                border: "1px solid var(--accent)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTokenKey(tokenKey);
                                setEditingTokenName(name);
                              }}
                              title="Click to rename"
                              style={{
                                flex: 1,
                                cursor: "pointer",
                                fontWeight: 500,
                                color: "var(--text-primary)",
                                textDecoration: "underline",
                                textDecorationStyle: "dotted",
                              }}
                            >
                              {name}
                            </span>
                          )}
                          {isEditing && (
                            <button
                              onClick={() => handleRenameToken("admin", tokenKey, editingTokenName)}
                              style={{
                                padding: "2px 6px",
                                fontSize: 11,
                                background: "var(--accent)",
                                border: "none",
                                borderRadius: "4px",
                                color: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                    User Tokens (Name / Token)
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {systemTokens.filter(t => t.type === "user").length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                        No user tokens configured
                      </span>
                    ) : (
                      systemTokens.filter(t => t.type === "user").map(({ token: tokenKey, name }) => {
                        const isEditing = editingTokenKey === tokenKey;
                        const masked = tokenKey.substring(0, 3) + "...";
                        return (
                          <div
                            key={tokenKey}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 12,
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border)",
                              padding: "6px 12px",
                              borderRadius: "6px",
                            }}
                          >
                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0 }}>
                              {masked}
                            </span>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTokenName}
                                onChange={(e) => setEditingTokenName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleRenameToken("user", tokenKey, editingTokenName);
                                  } else if (e.key === "Escape") {
                                    setEditingTokenKey(null);
                                  }
                                }}
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: "2px 6px",
                                  fontSize: 12,
                                  backgroundColor: "var(--bg-base)",
                                  border: "1px solid var(--accent)",
                                  borderRadius: "4px",
                                  color: "var(--text-primary)",
                                }}
                              />
                            ) : (
                              <span
                                onClick={() => {
                                  setEditingTokenKey(tokenKey);
                                  setEditingTokenName(name);
                                }}
                                title="Click to rename"
                                style={{
                                  flex: 1,
                                  cursor: "pointer",
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                  textDecoration: "underline",
                                  textDecorationStyle: "dotted",
                                }}
                              >
                                {name}
                              </span>
                            )}
                            {isEditing ? (
                              <button
                                onClick={() => handleRenameToken("user", tokenKey, editingTokenName)}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: 11,
                                  background: "var(--accent)",
                                  border: "none",
                                  borderRadius: "4px",
                                  color: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeleteUserToken(tokenKey, name)}
                                style={{
                                  padding: "2px 8px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "var(--error, #e74c3c)",
                                  background: "transparent",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius-sm)",
                                  cursor: "pointer",
                                  transition: "opacity 0.2s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <form onSubmit={handleGenerateUserToken} style={{ display: "flex", gap: 12, alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                      New User Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      style={{
                        padding: "7px 10px",
                        fontSize: 13,
                        backgroundColor: "var(--bg-base)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={generatingToken || !newTokenName.trim()}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: generatingToken || !newTokenName.trim() ? "not-allowed" : "pointer",
                      opacity: generatingToken || !newTokenName.trim() ? 0.5 : 1,
                    }}
                  >
                    {generatingToken ? "Generating..." : "Generate User Token"}
                  </button>
                </form>

                {generatedUserToken && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                      Generated User Token (Copy now! This will disappear on page refresh):
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="text"
                        readOnly
                        value={generatedUserToken}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          fontSize: 12,
                          backgroundColor: "var(--bg-base)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          color: "var(--text-primary)",
                        }}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedUserToken);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 3000);
                        }}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 500,
                          background: copied ? "var(--accent-glow)" : "var(--bg-elevated)",
                          border: "1px solid " + (copied ? "var(--border-accent)" : "var(--border)"),
                          borderRadius: "4px",
                          color: copied ? "var(--accent)" : "var(--text-primary)",
                          cursor: "pointer",
                          minWidth: 70,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Runner Tokens Section (Only for Admin) */}
          {userRole === "admin" && (
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
                Runner Tokens
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                Each Runner machine authenticates with its own dedicated token, generated here and passed to the
                Runner binary via <code>--token</code> or <code>ARONDO_RUNNER_TOKEN</code>. A token locks to the
                first Runner identity that connects with it, so it can't later be reused to impersonate a
                different Runner.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {runnerTokens.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    No runner tokens configured. Generate one below before starting a Runner.
                  </span>
                ) : (
                  runnerTokens.map(({ id, token: tokenKey, name, runnerName, connected }) => {
                    const isEditing = editingRunnerTokenId === id;
                    const masked = tokenKey.substring(0, 3) + "...";
                    return (
                      <div
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          padding: "6px 12px",
                          borderRadius: "6px",
                        }}
                      >
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0 }}>
                          {masked}
                        </span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingRunnerTokenName}
                            onChange={(e) => setEditingRunnerTokenName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameRunnerToken(id, editingRunnerTokenName);
                              } else if (e.key === "Escape") {
                                setEditingRunnerTokenId(null);
                              }
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: "2px 6px",
                              fontSize: 12,
                              backgroundColor: "var(--bg-base)",
                              border: "1px solid var(--accent)",
                              borderRadius: "4px",
                              color: "var(--text-primary)",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingRunnerTokenId(id);
                              setEditingRunnerTokenName(name);
                            }}
                            title="Click to rename"
                            style={{
                              flex: 1,
                              cursor: "pointer",
                              fontWeight: 500,
                              color: "var(--text-primary)",
                              textDecoration: "underline",
                              textDecorationStyle: "dotted",
                            }}
                          >
                            {name}
                          </span>
                        )}
                        {!isEditing && (
                          <span style={{ fontSize: 11, color: connected ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }}>
                            {runnerName ? (connected ? `● ${runnerName}` : `○ ${runnerName}`) : "unused"}
                          </span>
                        )}
                        {isEditing ? (
                          <button
                            onClick={() => handleRenameRunnerToken(id, editingRunnerTokenName)}
                            style={{
                              padding: "2px 6px",
                              fontSize: 11,
                              background: "var(--accent)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteRunnerToken(id, name)}
                            style={{
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--error, #e74c3c)",
                              background: "transparent",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                              transition: "opacity 0.2s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <form onSubmit={handleGenerateRunnerToken} style={{ display: "flex", gap: 12, alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                      New Runner Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MacBook Air"
                      value={newRunnerTokenName}
                      onChange={(e) => setNewRunnerTokenName(e.target.value)}
                      style={{
                        padding: "7px 10px",
                        fontSize: 13,
                        backgroundColor: "var(--bg-base)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={generatingRunnerToken || !newRunnerTokenName.trim()}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: generatingRunnerToken || !newRunnerTokenName.trim() ? "not-allowed" : "pointer",
                      opacity: generatingRunnerToken || !newRunnerTokenName.trim() ? 0.5 : 1,
                    }}
                  >
                    {generatingRunnerToken ? "Generating..." : "Generate Runner Token"}
                  </button>
                </form>

                {generatedRunnerToken && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                      Generated Runner Token (Copy now! This will disappear on page refresh):
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="text"
                        readOnly
                        value={generatedRunnerToken}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          fontSize: 12,
                          backgroundColor: "var(--bg-base)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          color: "var(--text-primary)",
                        }}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedRunnerToken);
                          setRunnerTokenCopied(true);
                          setTimeout(() => setRunnerTokenCopied(false), 3000);
                        }}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 500,
                          background: runnerTokenCopied ? "var(--accent-glow)" : "var(--bg-elevated)",
                          border: "1px solid " + (runnerTokenCopied ? "var(--border-accent)" : "var(--border)"),
                          borderRadius: "4px",
                          color: runnerTokenCopied ? "var(--accent)" : "var(--text-primary)",
                          cursor: "pointer",
                          minWidth: 70,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {runnerTokenCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
