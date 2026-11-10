"use client";

import type { CSSProperties } from "react";
import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { type ModelQuotas } from "@/lib/agent-quota-display";

import DropdownQuotaBars from "./DropdownQuotaBars";

interface Props {
  runnerId: string;
  agentType: string;
  isAgentAvailable: (command: string) => boolean;
  onSelect: (agent: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function availableAgentItems(isAgentAvailable: (command: string) => boolean) {
  const agents = [
    { value: "antigravity", label: "Antigravity CLI", cmd: "agy" },
    { value: "claude", label: "Claude Code", cmd: "claude" },
    { value: "codex", label: "Codex", cmd: "codex" },
    { value: "opencode", label: "OpenCode", cmd: "opencode" },
    { value: "pi", label: "Pi", cmd: "pi" },
  ].filter(({ cmd }) => isAgentAvailable(cmd));
  return [...(agents.length > 1 ? [{ value: "auto", label: "Auto" }] : []), ...agents];
}

export function AgentOptionQuota({ value, quotas, loading = false }: { value: string; quotas: ModelQuotas | null; loading?: boolean }) {
  if (value === "antigravity") {
    return (
      <>
        {[
          ["Gemini", "Gemini"], ["Anthropic & Other", "Other"], ["Gemini 4 Argon", "Argon"],
        ].map(([name, group]) => (
          <span key={group} className="dropdown-option-quota">
            <span className="agent-quota-line">{name}</span>
            <DropdownQuotaBars quotas={quotas} agent="antigravity" group={group} loading={loading} />
          </span>
        ))}
      </>
    );
  }
  if (value === "claude" || value === "codex" || value === "opencode") {
    return (
      <span className="dropdown-option-quota">
        <DropdownQuotaBars quotas={quotas} agent={value} loading={loading} />
      </span>
    );
  }
  return null;
}

export function AgentDropdownOptions({ agentType, isAgentAvailable, onSelect, quotas, loading = false, className = "new-session-dropdown-menu", style }: Omit<Props, "runnerId"> & { quotas: ModelQuotas | null; loading?: boolean }) {
  return (
    <div className={`custom-dropdown-menu ${className}`} style={style}>
      {availableAgentItems(isAgentAvailable).map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`custom-dropdown-item dropdown-quota-option ${agentType === value ? "active" : ""}`}
          onClick={() => onSelect(value)}
        >
          <span className="dropdown-option-name">{label}</span>
          <AgentOptionQuota value={value} quotas={quotas} loading={loading} />
        </button>
      ))}
    </div>
  );
}

export default function AgentDropdownMenu(props: Props) {
  const { quotas, loading } = useAgentQuotas(props.runnerId);
  return <AgentDropdownOptions {...props} quotas={quotas} loading={loading} />;
}
