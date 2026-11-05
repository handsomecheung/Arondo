"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AgentModelsManager from "@/components/AgentModelsManager";
import type { AgentModelsConfig } from "@/lib/store";
import type { AdminSettingsData } from "../settings-data";

export default function SettingsPage() {
  const router = useRouter();
  const [agentModels, setAgentModels] = useState<AgentModelsConfig | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load agent models");
        return r.json();
      })
      .then((data: AdminSettingsData) => {
        setAgentModels(data.agentModels);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!loaded) return <p role="status">Loading…</p>;
  return (
    <>
      <AgentModelsManager
        initialConfig={agentModels}
        onSaved={() => router.push("/admin/settings")}
        onCancel={() => router.push("/admin/settings")}
      />
    </>
  );
}
