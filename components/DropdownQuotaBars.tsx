import { getQuotaRows, getQuotaScoreColors, type ModelQuotas, type QuotaGroup } from "@/lib/agent-quota-display";

export default function DropdownQuotaBars({ quotas, agent, group = "", loading = false }: {
  quotas: ModelQuotas | null;
  agent: "antigravity" | "claude" | "codex";
  group?: string;
  loading?: boolean;
}) {
  const quota = quotas?.[agent];
  if (loading) return <span>Loading quota…</span>;
  if (quota?.IsAPIKey) return <span>API key billing · Quota unavailable</span>;
  const rows = getQuotaRows(quota, agent, group);
  if (!rows.length) return <span>Quota unavailable</span>;
  const colorKey = (agent === "antigravity" ? group.toLowerCase() : agent) as QuotaGroup;
  const color = getQuotaScoreColors(quotas)[colorKey];
  return (
    <span className="dropdown-quota-bars">
      {rows.map((row) => {
        const percent = Math.round(row.remaining * 100);
        const barColor = row.resetsAt == null || (agent === "codex" && row.label === "hour")
          ? "var(--text-muted)" : color ?? "var(--text-muted)";
        return (
          <span key={row.label} className="dropdown-quota-row" title={row.resetsAt == null ? undefined : `Resets ${new Date(row.resetsAt * 1000).toLocaleString()}`}>
            <span>{row.label}:</span>
            <span
              className="dropdown-quota-track"
              role="progressbar"
              aria-label={`${group || agent} ${row.label} quota remaining`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span className="dropdown-quota-fill" style={{ width: `${percent}%`, background: barColor }} />
            </span>
            <span className="dropdown-quota-percent">{percent}%</span>
          </span>
        );
      })}
    </span>
  );
}
