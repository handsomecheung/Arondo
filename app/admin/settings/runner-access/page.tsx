"use client";
import type { TokenInfo, Runner } from "../settings-data";
import { useState, useEffect, useCallback } from "react";

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
  const [systemTokens, setSystemTokens] = useState<TokenInfo[]>([]);
  const loadRunners = useCallback(() => {
    fetch("/api/runners")
      .then((r) => r.json())
      .then((data: Runner[]) => {
        if (Array.isArray(data)) setRunners(data);
      })
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
  const saveRunnerUserTokenUuids = useCallback(
    async (runnerId: string, allowedUserTokenUuids: string[]) => {
      try {
        const res = await fetch("/api/runners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: runnerId, allowedUserTokenUuids }),
        });
        if (res.ok) {
          setRunners((prev) =>
            prev.map((r) =>
              r.id === runnerId ? { ...r, allowedUserTokenUuids } : r,
            ),
          );
        } else {
          alert("Failed to update allowed tokens");
        }
      } catch (err) {
        console.error("Failed to save runner tokens:", err);
      }
    },
    [],
  );
  useEffect(() => {
    loadSystemTokens();
  }, [loadSystemTokens]);
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
          Runner Access Control
        </h2>
        <p
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}
        >
          Configure which users (by access tokens) are allowed to access each
          runner. If no users are selected, the runner allows public access.
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
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
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    ({r.hostname})
                  </span>
                </div>
                <div>
                  {
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      {systemTokens.filter((t) => t.type === "user").length ===
                      0 ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          No user tokens configured. Create one in System Access
                          Tokens.
                        </span>
                      ) : (
                        systemTokens
                          .filter((t) => t.type === "user")
                          .map(
                            ({
                              token: tokenKey,
                              uuid: tokenUuid,
                              name,
                              type,
                              color,
                            }) => {
                              const isAllowed = (
                                r.allowedUserTokenUuids || []
                              ).includes(tokenUuid);
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
                                      const current =
                                        r.allowedUserTokenUuids || [];
                                      let updated: string[];
                                      if (e.target.checked) {
                                        updated = [...current, tokenUuid];
                                      } else {
                                        updated = current.filter(
                                          (t) => t !== tokenUuid,
                                        );
                                      }
                                      await saveRunnerUserTokenUuids(
                                        r.id,
                                        updated,
                                      );
                                    }}
                                    style={{ cursor: "pointer" }}
                                  />
                                  <div
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: "50%",
                                      backgroundColor: color || "#6b7280",
                                      color: "#fff",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 8,
                                      fontWeight: 600,
                                      flexShrink: 0,
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {name.charAt(0) || "?"}
                                  </div>
                                  <span style={{ fontWeight: 500 }}>
                                    {name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--text-muted)",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    ({isUserToken ? "User" : "Admin"}: {masked})
                                  </span>
                                </label>
                              );
                            },
                          )
                      )}
                    </div>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
