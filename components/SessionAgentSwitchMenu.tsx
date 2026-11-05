"use client";

import { useState } from "react";
import type { AgentModelsConfig } from "@/lib/agentModels";
import AgentDropdownMenu from "./AgentDropdownMenu";
import ModelDropdownMenu from "./ModelDropdownMenu";

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
  const [modelAgent, setModelAgent] = useState<ModelAgent | null>(null);
  const menuProps = {
    className: "session-agent-switch-menu",
    style: {
      position: "fixed" as const, top: position.top, left: position.left,
      right: "auto", bottom: "auto",
      maxHeight: `min(400px, calc(100dvh - ${position.top + 8}px))`,
      boxShadow: "var(--shadow-card)", transformOrigin: "top right",
    },
  };
  if (modelAgent) {
    return <ModelDropdownMenu
      {...menuProps}
      runnerId={runnerId}
      agentType={modelAgent}
      selectedModel={modelAgent === agentType ? selectedModel ?? "" : ""}
      config={config}
      header={<button type="button" className="custom-dropdown-item" onClick={() => setModelAgent(null)}>← Agents</button>}
      onSelect={(model) => onSelect(modelAgent, model)}
    />;
  }
  return <AgentDropdownMenu
    {...menuProps}
    runnerId={runnerId}
    agentType={agentType}
    isAgentAvailable={isAgentAvailable}
    onSelect={(agent) => {
      if (agent === "auto") onSelect(agent);
      else setModelAgent(agent as ModelAgent);
    }}
  />;
}
