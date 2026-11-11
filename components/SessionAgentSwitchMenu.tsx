"use client";

import { useState } from "react";
import type { AgentModelsConfig } from "@/lib/agentModels";
import { useAgentQuotas } from "@/lib/hooks/useAgentQuotas";
import { getEffectiveModel, getEffortChoices, getFamilyDefaultModel, isEffortAgent, modelFamilyOf } from "@/lib/model-effort";
import { IconX } from "@/components/Icons";
import { AgentOptionQuota, availableAgentItems } from "./AgentDropdownMenu";
import { ModelOptions } from "./ModelDropdownMenu";

type ModelAgent = "antigravity" | "claude" | "codex" | "opencode" | "pi";

export default function SessionAgentSwitchMenu({ runnerId, agentType, selectedModel, config, isAgentAvailable, onSelect, position }: {
  runnerId: string;
  agentType: string;
  selectedModel?: string;
  config?: AgentModelsConfig | null;
  isAgentAvailable: (command: string) => boolean;
  onSelect: (agent: string, model?: string) => void;
  position: { top: number; left: number };
}) {
  const [modelAgent, setModelAgent] = useState<string | null>(null);
  const { quotas, loading } = useAgentQuotas(runnerId);
  const items = availableAgentItems(isAgentAvailable);
  const modelAgentLabel = items.find((item) => item.value === modelAgent)?.label ?? "";
  const modelAgentActive = modelAgent === agentType;
  const currentModel = getEffectiveModel(modelAgent ?? agentType, modelAgentActive ? selectedModel : undefined, config);
  const choices = modelAgent && currentModel && isEffortAgent(modelAgent)
    ? getEffortChoices(modelAgent, currentModel, config)
    : [];

  return (
    <>
      <div
        className="custom-dropdown-menu session-agent-switch-menu"
        style={{
          position: "fixed", top: position.top, left: position.left,
          right: "auto", bottom: "auto",
          maxHeight: `min(400px, calc(100dvh - ${position.top + 8}px))`,
          boxShadow: "var(--shadow-card)", transformOrigin: "top right",
        }}
      >
        {items.map(({ value, label }) => {
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
          return (
            <button
              key={value}
              type="button"
              className={`custom-dropdown-item dropdown-quota-option ${agentType === value ? "active" : ""}`}
              aria-haspopup="dialog"
              onClick={() => setModelAgent(value)}
            >
              <span className="dropdown-option-name">{label}</span>
              <AgentOptionQuota value={value} quotas={quotas} loading={loading} />
            </button>
          );
        })}
      </div>

      {modelAgent && (
        <div className="modal-backdrop" onClick={() => setModelAgent(null)}>
          <div
            className="modal session-agent-popup"
            role="dialog"
            aria-label={`${modelAgentLabel} models`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">{modelAgentLabel}</span>
              <button className="modal-close-btn" onClick={() => setModelAgent(null)} aria-label="Close">
                <IconX />
              </button>
            </div>
            <div className="modal-body session-agent-popup-body">
              {choices.length > 1 && (
                <div className="session-agent-popup-section">
                  <span className="session-agent-popup-label">Thinking effort</span>
                  <div className="sidebar-mode-toggle effort-toggle session-agent-popup-effort" role="tablist" aria-label="Thinking effort">
                    {choices.map((choice) => (
                      <button
                        key={choice.model}
                        type="button"
                        role="tab"
                        aria-selected={currentModel === choice.model}
                        className={`sidebar-mode-tab${currentModel === choice.model ? " active" : ""}`}
                        onClick={() => onSelect(modelAgent, choice.model)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="session-agent-popup-section session-agent-popup-models">
                <span className="session-agent-popup-label">Model</span>
                <div className="session-agent-popup-list">
                  <ModelOptions
                    agentType={modelAgent as ModelAgent}
                    selectedModel={modelFamilyOf(modelAgent, currentModel)}
                    config={config}
                    byFamily
                    quotas={quotas}
                    loading={loading}
                    onSelect={(family) => onSelect(modelAgent, getFamilyDefaultModel(modelAgent, family, config))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
