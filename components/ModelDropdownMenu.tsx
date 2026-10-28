"use client";

import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { type ModelQuotas } from "@/lib/agent-quota-display";
import { DEFAULT_AGENT_MODELS, parseModelList, type AgentModelsConfig } from "@/lib/agentModels";

import DropdownQuotaBars from "./DropdownQuotaBars";

interface Props {
  runnerId: string;
  agentType: "antigravity" | "claude" | "codex";
  selectedModel: string;
  config?: AgentModelsConfig | null;
  onSelect: (model: string) => void;
}

export function ModelDropdownOptions({ agentType, selectedModel, config, onSelect, quotas, loading = false }: Omit<Props, "runnerId"> & { quotas: ModelQuotas | null; loading?: boolean }) {
  const agy = config?.antigravity;
  const groups = agentType === "antigravity"
    ? [
      { name: "Gemini", key: "Gemini", models: agy?.gemini?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.gemini.availableModels },
      { name: "Anthropic & Other", key: "Other", models: agy?.other?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.other.availableModels },
      { name: "Gemini 4 Argon", key: "Argon", models: agy?.argon?.availableModels ?? DEFAULT_AGENT_MODELS.antigravity.argon?.availableModels },
    ]
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
    <div className="custom-dropdown-menu new-session-dropdown-menu new-session-model-dropdown-menu">
      {option("")}
      {groups.map((group) => {
        const models = parseModelList(group.models);
        if (!models.length) return null;
        return (
          <div key={group.key} className="custom-dropdown-group">
            {group.name && (
              <div className="custom-dropdown-group-header model-quota-group-header">
                {group.name}
                <span className="model-group-quota">
                  <DropdownQuotaBars quotas={quotas} agent={agentType} group={group.key} loading={loading} />
                </span>
              </div>
            )}
            {models.map((model) => option(model))}
          </div>
        );
      })}
    </div>
  );
}

export default function ModelDropdownMenu(props: Props) {
  const { quotas, loading } = useAgentQuotas(props.runnerId, props.agentType === "antigravity");
  return <ModelDropdownOptions {...props} quotas={quotas} loading={loading} />;
}
