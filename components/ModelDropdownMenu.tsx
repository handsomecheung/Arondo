"use client";

import type { CSSProperties, ReactNode } from "react";
import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { type ModelQuotas } from "@/lib/agent-quota-display";
import { DEFAULT_AGENT_MODELS, getOpencodeModelGroups, parseModelList, parseOpencodeModelList, type AgentModelsConfig } from "@/lib/agentModels";

import DropdownQuotaBars from "./DropdownQuotaBars";

interface Props {
  runnerId: string;
  className?: string;
  style?: CSSProperties;
  header?: ReactNode;
  agentType: "antigravity" | "claude" | "codex" | "opencode";
  selectedModel: string;
  config?: AgentModelsConfig | null;
  onSelect: (model: string) => void;
}

type ModelOptionsProps = Pick<Props, "agentType" | "selectedModel" | "config" | "onSelect"> & { quotas: ModelQuotas | null; loading?: boolean };

export function ModelOptions({ agentType, selectedModel, config, onSelect, quotas, loading = false }: ModelOptionsProps) {
  const isOpencodeFree = agentType === "opencode" && (
    quotas?.opencode?.Plan?.toLowerCase() === "free" ||
    quotas?.opencode?.Account === "unauthenticated"
  );
  const agy = config?.antigravity;
  const groups = agentType === "antigravity"
    ? [
      { name: "Gemini", key: "Gemini", models: agy?.gemini?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.gemini.availableModels },
      { name: "Anthropic & Other", key: "Other", models: agy?.other?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.other.availableModels },
      { name: "Gemini 4 Argon", key: "Argon", models: agy?.argon?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.argon?.availableModels },
    ]
    : agentType === "opencode" ? getOpencodeModelGroups(config?.opencode, { freeOnly: isOpencodeFree })
    : [{ name: "", key: "", models: config?.[agentType]?.availableModels ?? DEFAULT_AGENT_MODELS[agentType].availableModels }];
  const option = (model: string) => (
    <button
      key={model}
      type="button"
      className={`custom-dropdown-item dropdown-quota-option ${selectedModel === model ? "active" : ""}`}
      onClick={() => onSelect(model)}
    >
      <span className="dropdown-option-name">{model || "Default"}</span>
    </button>
  );
  return (
    <>
      {option("")}
      {groups.map((group) => {
        const models = (agentType === "opencode" ? parseOpencodeModelList : parseModelList)(group.models);
        if (!models.length) return null;
        return (
          <div key={group.key} className="custom-dropdown-group">
            {group.name && (
              <div className="custom-dropdown-group-header model-quota-group-header">
                {group.name}
                {group.key !== "Free" && <span className="model-group-quota">
                  <DropdownQuotaBars quotas={quotas} agent={agentType} group={group.key} loading={loading} />
                </span>}
              </div>
            )}
            {models.map((model) => option(model))}
          </div>
        );
      })}
    </>
  );
}

export function ModelDropdownOptions({ className = "new-session-dropdown-menu new-session-model-dropdown-menu", style, header, ...props }: Omit<Props, "runnerId"> & { quotas: ModelQuotas | null; loading?: boolean }) {
  return (
    <div className={`custom-dropdown-menu ${className}`} style={style}>
      {header}
      <ModelOptions {...props} />
    </div>
  );
}

export default function ModelDropdownMenu(props: Props) {
  const { quotas, loading } = useAgentQuotas(props.runnerId);
  return <ModelDropdownOptions {...props} quotas={quotas} loading={loading} />;
}
