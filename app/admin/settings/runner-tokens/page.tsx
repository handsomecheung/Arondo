"use client";
import { useState, useEffect, useCallback } from "react";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
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
export default function SettingsPage() {
  const [runnerTokens, setRunnerTokens] = useState<RunnerTokenInfo[]>([]);
  const [generatedRunnerToken, setGeneratedRunnerToken] = useState<
    string | null
  >(null);
  const [generatingRunnerToken, setGeneratingRunnerToken] = useState(false);
  const [runnerTokenCopied, setRunnerTokenCopied] = useState(false);
  const [newRunnerTokenName, setNewRunnerTokenName] = useState("");
  const [editingRunnerTokenId, setEditingRunnerTokenId] = useState<
    string | null
  >(null);
  const [editingRunnerTokenName, setEditingRunnerTokenName] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
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
          const res = await fetch(
            `/api/auth/runner-tokens?id=${encodeURIComponent(id)}`,
            {
              method: "DELETE",
            },
          );
          if (res.ok) {
            loadRunnerTokens();
          }
        } catch (err) {
          console.error("Failed to delete runner token:", err);
        }
      },
    });
  };
  useEffect(() => {
    loadRunnerTokens();
  }, [loadRunnerTokens]);

  return (
    <>
      {
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
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            Each Runner machine authenticates with its own dedicated token,
            generated here and passed to the Runner binary via{" "}
            <code>--token</code> or <code>ARONDO_RUNNER_TOKEN</code>. A token
            locks to the first Runner identity that connects with it, so it
            can&apos;t later be reused to impersonate a different Runner.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {runnerTokens.length === 0 ? (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                No runner tokens configured. Generate one below before starting
                a Runner.
              </span>
            ) : (
              runnerTokens.map(
                ({ id, token: tokenKey, name, runnerName, connected }) => {
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
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {masked}
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingRunnerTokenName}
                          onChange={(e) =>
                            setEditingRunnerTokenName(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleRenameRunnerToken(
                                id,
                                editingRunnerTokenName,
                              );
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
                        <span
                          style={{
                            fontSize: 11,
                            color: connected
                              ? "var(--accent)"
                              : "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {runnerName
                            ? connected
                              ? `● ${runnerName}`
                              : `○ ${runnerName}`
                            : "unused"}
                        </span>
                      )}
                      {isEditing ? (
                        <button
                          onClick={() =>
                            handleRenameRunnerToken(id, editingRunnerTokenName)
                          }
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
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.7";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                },
              )
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <form
              onSubmit={handleGenerateRunnerToken}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-end",
                maxWidth: 400,
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
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
                    outline: "none",
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
                  cursor:
                    generatingRunnerToken || !newRunnerTokenName.trim()
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    generatingRunnerToken || !newRunnerTokenName.trim()
                      ? 0.5
                      : 1,
                }}
              >
                {generatingRunnerToken
                  ? "Generating..."
                  : "Generate Runner Token"}
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
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  Generated Runner Token (Copy now! This will disappear on page
                  refresh):
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
                      background: runnerTokenCopied
                        ? "var(--accent-glow)"
                        : "var(--bg-elevated)",
                      border:
                        "1px solid " +
                        (runnerTokenCopied
                          ? "var(--border-accent)"
                          : "var(--border)"),
                      borderRadius: "4px",
                      color: runnerTokenCopied
                        ? "var(--accent)"
                        : "var(--text-primary)",
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
      }
      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </>
  );
}
