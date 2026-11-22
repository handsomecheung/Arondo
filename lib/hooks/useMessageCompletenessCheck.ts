"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useMessageCompletenessCheck(scope: string, prompt: string) {
  const [isChecking, setIsChecking] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const busy = useRef(false);
  const resolver = useRef<((send: boolean) => void) | null>(null);
  const request = useRef<AbortController | null>(null);

  const resolve = useCallback((send: boolean) => {
    resolver.current?.(send);
    resolver.current = null;
    setNeedsConfirmation(false);
  }, []);

  useEffect(() => () => {
    request.current?.abort();
    resolve(false);
  }, [scope, prompt, resolve]);

  const check = useCallback(async (message: string, sessionId?: string): Promise<boolean> => {
    if (!message.trim() || /^[!/]/.test(message.trim())) return true;
    if (busy.current) return false;
    busy.current = true;
    setIsChecking(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/messages/check-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
        body: JSON.stringify({ message, sessionId }),
      });
      if (!response.ok) return true;
      const result = await response.json();
      if (controller.signal.aborted) return false;
      if (result.incomplete !== true) return true;
      return await new Promise<boolean>((resolveSend) => {
        resolver.current = resolveSend;
        setNeedsConfirmation(true);
      });
    } catch {
      return !controller.signal.aborted;
    } finally {
      request.current = null;
      busy.current = false;
      setIsChecking(false);
    }
  }, []);

  return { check, isChecking, needsConfirmation, resolve };
}
