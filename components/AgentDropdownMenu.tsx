"use client";

import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { type ModelQuotas } from "@/lib/agent-quota-display";

import DropdownQuotaBars from "./DropdownQuotaBars";

interface Props {
  runnerId: string;
  agentType: string;
  isAgentAvailable: (command: string) => boolean;
  onSelect: (agent: string) => void;
}

export function AgentDropdownOptions({ agentType, isAgentAvailable, onSelect, quotas, loading = false }: Omit<Props, "runnerId"> & { quotas: ModelQuotas | null; loading?: boolean }) {
  const agents = [
    { value: "antigravity", label: "Antigravity CLI", cmd: "agy" },
    { value: "claude", label: "Claude Code", cmd: "claude" },
    { value: "codex", label: "Codex", cmd: "codex" },
    { value: "opencode", label: "OpenCode", cmd: "opencode" },
  ].filter(({ cmd }) => isAgentAvailable(cmd));
  const items = [...(agents.length > 1 ? [{ value: "auto", label: "Auto" }] : []), ...agents];
  return (
    <div className="custom-dropdown-menu new-session-dropdown-menu">
      {items.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`custom-dropdown-item dropdown-quota-option ${agentType === value ? "active" : ""}`}
          onClick={() => onSelect(value)}
        >
          <span className="dropdown-option-name">{label}</span>
          {value === "antigravity" && [
            ["Gemini", "Gemini"], ["Anthropic & Other", "Other"], ["Gemini 4 Argon", "Argon"],
          ].map(([name, group]) => (
            <span key={group} className="dropdown-option-quota">
              <span className="agent-quota-line">{name}</span>
              <DropdownQuotaBars quotas={quotas} agent="antigravity" group={group} loading={loading} />
            </span>
          ))}
          {(value === "claude" || value === "codex") && (
            <span className="dropdown-option-quota">
              <DropdownQuotaBars quotas={quotas} agent={value} loading={loading} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function AgentDropdownMenu(props: Props) {
  const { quotas, loading } = useAgentQuotas(props.runnerId);
  return <AgentDropdownOptions {...props} quotas={quotas} loading={loading} />;
}
