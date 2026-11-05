"use client";

import { useState } from "react";
import type { AgentModelsConfig } from "@/lib/agentModels";
import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { AgentOptionQuota, availableAgentItems } from "./AgentDropdownMenu";
import { ModelOptions } from "./ModelDropdownMenu";

type ModelAgent = "antigravity" | "claude" | "codex" | "opencode";

export default function SessionAgentSwitchMenu({ runnerId, agentType, selectedModel, config, isAgentAvailable, onSelect, position }: {
  runnerId: string;
  agentType: string;
  selectedModel?: string;
  config?: AgentModelsConfig | null;
  isAgentAvailable: (command: string) => boolean;
  onSelect: (agent: string, model?: string) => void;
  position: { top: number; left: number };
}) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(agentType);
  const { quotas, loading } = useAgentQuotas(runnerId);
  return (
    <div
      className="custom-dropdown-menu session-agent-switch-menu"
      style={{
        position: "fixed", top: position.top, left: position.left,
        right: "auto", bottom: "auto",
        maxHeight: `min(400px, calc(100dvh - ${position.top + 8}px))`,
        boxShadow: "var(--shadow-card)", transformOrigin: "top right",
      }}
    >
      {availableAgentItems(isAgentAvailable).map(({ value, label }) => {
        if (value === "auto") {
          return (
            <button
              key={value}
              type="button"
              className={`custom-dropdown-item dropdown-quota-option ${agentType === value ? "active" : ""}`}
              onClick={() => onSelect(value)}
            >
              <span className="dropdown-option-name">{label}</span>
            </button>
          );
        }
        const active = agentType === value;
        const expanded = expandedAgent === value;
        return (
          <div key={value}>
            <button
              type="button"
              className={`custom-dropdown-item dropdown-quota-option ${active ? "active" : ""}`}
              aria-expanded={expanded}
              onClick={() => setExpandedAgent(expanded ? null : value)}
            >
              <span className="dropdown-option-name">{label}</span>
              <AgentOptionQuota value={value} quotas={quotas} loading={loading} />
            </button>
            {expanded && (
              <div className="session-agent-model-list">
                <ModelOptions
                  agentType={value as ModelAgent}
                  selectedModel={active ? selectedModel ?? "" : ""}
                  config={config}
                  quotas={quotas}
                  loading={loading}
                  onSelect={(model) => onSelect(value, model)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
