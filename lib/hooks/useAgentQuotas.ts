"use client";

import { useEffect, useState } from "react";
import type { ModelQuotas } from "@/lib/agent-quota-display";

export function useAgentQuotas(runnerId: string, enabled = true) {
  const [result, setResult] = useState<{ runnerId: string; quotas: ModelQuotas | null } | null>(null);
  useEffect(() => {
    if (!runnerId || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/agents/info?runnerId=${encodeURIComponent(runnerId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load agent quota");
        const quotas: ModelQuotas = await response.json();
        if (!controller.signal.aborted) setResult({ runnerId, quotas });
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setResult({ runnerId, quotas: null });
      });
    return () => controller.abort();
  }, [runnerId, enabled]);
  const current = result?.runnerId === runnerId ? result : null;
  return { quotas: current?.quotas ?? null, loading: enabled && !!runnerId && !current };
}
