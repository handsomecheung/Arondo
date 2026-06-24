"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Runner {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  connected: boolean;
  version?: string;
  capabilities?: string[];
  agents?: string[];
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
  const [runners, setRunners] = useState<Runner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);

  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => setRunners(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadRunners();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
      .catch(console.error);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => setSessions(data))
      .catch(console.error);

    const poll = setInterval(loadRunners, 10_000);
    return () => clearInterval(poll);
  }, [loadRunners]);

  const selectedRunner = runners.find((r) => r.id === selectedRunnerId) ?? null;
  const runnerProjects = selectedRunner
    ? projects.filter((p) => p.runnerId === selectedRunner.id)
    : [];

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
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
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
                <p>No runners connected.</p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {runners.map((r) => (
                  <div
                    key={r.id}
                    onClick={() =>
                      setSelectedRunnerId(
                        selectedRunnerId === r.id ? null : r.id,
                      )
                    }
                    style={{
                      padding: 14,
                      background:
                        selectedRunnerId === r.id
                          ? "var(--bg-surface)"
                          : "var(--bg-elevated)",
                      border:
                        selectedRunnerId === r.id
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
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
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      Host: {r.hostname}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Agents Section */}
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              AI Agents
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Agent CLI availability detected on each connected node at registration time.
            </p>

            {runners.length === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                No nodes connected. Connect a node to see agent availability.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {runners.map((r) => {
                  const agentDefs = [
                    { label: "Antigravity CLI", cmd: "agy", comingSoon: false },
                    { label: "Claude Code", cmd: "claude", comingSoon: false },
                    { label: "Codex", cmd: "codex", comingSoon: true },
                    { label: "OpenCode", cmd: "opencode", comingSoon: true },
                  ];
                  // agents === undefined means legacy runner (no detection support)
                  const hasAgentInfo = Array.isArray(r.agents);
                  return (
                    <div
                      key={r.id}
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {r.name}
                        </span>
                        <span
                          className={`task-status-badge ${r.connected ? "running" : "idle"}`}
                        >
                          {r.connected ? "connected" : "disconnected"}
                        </span>
                      </div>
                      {!hasAgentInfo ? (
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                          Agent detection not supported by this node version.
                        </p>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {agentDefs.map(({ label, cmd, comingSoon }) => {
                            const installed = !comingSoon && r.agents!.includes(cmd);
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
                                  background: installed ? "var(--accent-glow)" : "var(--bg-surface)",
                                  opacity: installed ? 1 : 0.5,
                                }}
                              >
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: installed ? "var(--accent)" : "var(--text-muted)",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: installed ? "var(--accent)" : "var(--text-muted)",
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Runner Detail */}
          {selectedRunner && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 12,
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    Node: {selectedRunner.name}
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Runner system details and associated projects
                  </p>
                </div>
                <span
                  className={`task-status-badge ${selectedRunner.connected ? "running" : "idle"}`}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  {selectedRunner.connected
                    ? "Active / Connected"
                    : "Disconnected"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(280px, 1fr))",
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        Host Name
                      </span>
                      <code
                        style={{
                          fontSize: 12,
                          color: "var(--text-primary)",
                        }}
                      >
                        {selectedRunner.hostname || "N/A"}
                      </code>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        OS / Platform
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-primary)",
                        }}
                      >
                        {selectedRunner.os} ({selectedRunner.arch})
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        Agent Version
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-primary)",
                        }}
                      >
                        {selectedRunner.version || "0.1.0"}
                      </span>
                    </div>
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
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {selectedRunner.capabilities &&
                    selectedRunner.capabilities.length > 0 ? (
                      selectedRunner.capabilities.map((cap) => (
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
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        Standard terminal execution
                      </span>
                    )}
                  </div>
                </div>
              </div>

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

                {runnerProjects.length === 0 ? (
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {runnerProjects.map((project) => {
                      const projSessions = sessions.filter(
                        (s) => s.projectId === project.id,
                      );
                      const folderName =
                        project.repoPath.split("/").pop() ||
                        project.repoPath;

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
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <div>
                              <h4
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {folderName}
                              </h4>
                              <code
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                }}
                              >
                                {project.repoPath}
                              </code>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <strong>Sessions:</strong>{" "}
                              {projSessions.length} total
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <strong>Status:</strong> Active
                            </span>
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
      </main>
    </div>
  );
}
