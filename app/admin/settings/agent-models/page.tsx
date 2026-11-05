"use client";
import { useState, useEffect } from "react";
import AgentModelsManager from "@/components/AgentModelsManager";
import type { AgentModelsConfig } from "@/lib/store";
import type { AdminSettingsData } from "../settings-data";

export default function SettingsPage() {
  const [agentModels, setAgentModels] = useState<AgentModelsConfig | undefined>(
    undefined,
  );
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AdminSettingsData) => {
        if (data.agentModels) setAgentModels(data.agentModels);
      })
      .catch(console.error);
  }, []);

  return (
    <>
      <AgentModelsManager
        initialConfig={agentModels}
        onSaved={(updated) => setAgentModels(updated)}
      />
    </>
  );
}
