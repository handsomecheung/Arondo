"use client";
import type { TokenInfo } from "../settings-data";
import { useState, useEffect, useCallback } from "react";
import ConfirmDialog from "@/components/modals/ConfirmDialog";

export default function SettingsPage() {
  const [systemTokens, setSystemTokens] = useState<TokenInfo[]>([]);
  const [generatedUserToken, setGeneratedUserToken] = useState<string | null>(
    null,
  );
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [editingTokenKey, setEditingTokenKey] = useState<string | null>(null);
  const [editingTokenName, setEditingTokenName] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
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
  const handleRenameToken = async (
    role: "admin" | "user",
    tokenKey: string,
    newName: string,
  ) => {
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
          const res = await fetch(
            `/api/auth/client-tokens?role=user&token=${encodeURIComponent(tokenKey)}`,
            {
              method: "DELETE",
            },
          );
          if (res.ok) {
            loadSystemTokens();
          }
        } catch (err) {
          console.error("Failed to delete token:", err);
        }
      },
    });
  };
  useEffect(() => {
    loadSystemTokens();
  }, [loadSystemTokens]);

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
            System Access Tokens
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            Manage system-wide access tokens. For security, existing tokens are
            only partially shown.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Admin Tokens (Name / Token)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {systemTokens
                  .filter((t) => t.type === "admin")
                  .map(({ token: tokenKey, name, color }) => {
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
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            backgroundColor: color || "#6b7280",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 600,
                            flexShrink: 0,
                            textTransform: "uppercase",
                          }}
                        >
                          {name.charAt(0) || "?"}
                        </div>
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
                            value={editingTokenName}
                            onChange={(e) =>
                              setEditingTokenName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameToken(
                                  "admin",
                                  tokenKey,
                                  editingTokenName,
                                );
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
                            onClick={() =>
                              handleRenameToken(
                                "admin",
                                tokenKey,
                                editingTokenName,
                              )
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
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
            <div>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                User Tokens (Name / Token)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {systemTokens.filter((t) => t.type === "user").length === 0 ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    No user tokens configured
                  </span>
                ) : (
                  systemTokens
                    .filter((t) => t.type === "user")
                    .map(({ token: tokenKey, name, color }) => {
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
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              backgroundColor: color || "#6b7280",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 600,
                              flexShrink: 0,
                              textTransform: "uppercase",
                            }}
                          >
                            {name.charAt(0) || "?"}
                          </div>
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
                              value={editingTokenName}
                              onChange={(e) =>
                                setEditingTokenName(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameToken(
                                    "user",
                                    tokenKey,
                                    editingTokenName,
                                  );
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
                              onClick={() =>
                                handleRenameToken(
                                  "user",
                                  tokenKey,
                                  editingTokenName,
                                )
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
                              onClick={() =>
                                handleDeleteUserToken(tokenKey, name)
                              }
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
                    })
                )}
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <form
              onSubmit={handleGenerateUserToken}
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
                    outline: "none",
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
                  cursor:
                    generatingToken || !newTokenName.trim()
                      ? "not-allowed"
                      : "pointer",
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
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  Generated User Token (Copy now! This will disappear on page
                  refresh):
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
                      background: copied
                        ? "var(--accent-glow)"
                        : "var(--bg-elevated)",
                      border:
                        "1px solid " +
                        (copied ? "var(--border-accent)" : "var(--border)"),
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
      }
      <ConfirmDialog
        confirmDialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </>
  );
}
