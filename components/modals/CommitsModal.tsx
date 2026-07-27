"use client";

import { useState, useEffect } from "react";
import { IconX, IconCommit, IconRefresh } from "@/components/Icons";

interface Commit {
  hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
  projectId?: string;
  onSelectCommit: (hash: string) => void;
}

function formatRelativeTime(isoString: string) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (e) {
    return isoString;
  }
}

export default function CommitsModal({ open, onClose, sessionId, projectId, onSelectCommit }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCommits = async () => {
    if (!sessionId && !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const url = sessionId
        ? `/api/sessions/${sessionId}/git-log?limit=50`
        : `/api/projects/${projectId}/git-log?limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCommits(data.commits || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load commits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCommits();
    }
  }, [open, sessionId, projectId]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-md commits-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: 680,
          maxHeight: "80vh",
        }}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="modal-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "1.1rem",
              fontWeight: 600,
            }}
          >
            <IconCommit /> Git Commit History
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={fetchCommits}
              disabled={loading}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: loading ? "spin 1s linear infinite" : undefined,
              }}
              title="Refresh"
            >
              <IconRefresh size={14} />
            </button>
            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconX />
            </button>
          </div>
        </div>

        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 0" }}>
              <div className="spinner" />
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                color: "var(--danger, #ef4444)",
                padding: "12px",
                background: "rgba(239, 68, 68, 0.1)",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && commits.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0", fontSize: 14 }}>
              No commits found.
            </div>
          )}

          {!loading && !error && commits.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commits.map((commit) => (
                <div
                  key={commit.hash}
                  onClick={() => onSelectCommit(commit.hash)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 16px",
                    background: "var(--bg-secondary, #f8fafc)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  className="commit-item"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        flex: 1,
                        wordBreak: "break-word",
                      }}
                    >
                      {commit.subject}
                    </div>
                    <code
                      style={{
                        fontSize: 11,
                        background: "var(--bg-tertiary, #e2e8f0)",
                        color: "var(--text-primary)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontFamily: "monospace",
                        flexShrink: 0,
                      }}
                    >
                      {commit.hash.substring(0, 7)}
                    </code>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span>
                      {commit.author}{" "}
                      <span style={{ fontSize: 11, opacity: 0.7 }}>&lt;{commit.email}&gt;</span>
                    </span>
                    <span>{formatRelativeTime(commit.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
