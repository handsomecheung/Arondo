"use client";

import { IconRefresh } from "./Icons";

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
  scoreColor?: string;
}

export default function QuotaCard({
  title,
  account,
  plan,
  model,
  updatedAt,
  rows,
  unavailableMessage,
  onRefresh,
  isRefreshing,
  refreshNotice,
}: {
  title: string;
  account: string;
  plan: string;
  model?: string;
  updatedAt: number | null;
  rows: QuotaRow[];
  unavailableMessage?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshNotice?: string;
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
        {(account || plan) ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {account && plan && account !== plan ? `${account} · ${plan}` : (account || plan)}
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{model}</div>
      </div>
      {unavailableMessage ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{unavailableMessage}</div>
      ) : (
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
                      ? "Unknown"
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
                        background: row.resetsAt == null
                          ? "var(--text-muted)"
                          : row.scoreColor ?? "var(--text-muted)",
                        transition: "width 0.3s ease",
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(updatedAt != null || onRefresh) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          {updatedAt != null && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Updated {formatTimestamp(updatedAt)}
            </span>
          )}
          {refreshNotice && (
            <span style={{ fontSize: 10, color: "var(--warning, #f59e0b)" }}>
              {refreshNotice}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh this agent's quota"
              aria-label={`Refresh ${title} quota`}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: isRefreshing ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                padding: 2,
                opacity: isRefreshing ? 0.5 : 1,
              }}
            >
              <span style={{ display: "flex", transform: isRefreshing ? "rotate(180deg)" : undefined, transition: "transform 0.3s ease" }}>
                <IconRefresh />
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
