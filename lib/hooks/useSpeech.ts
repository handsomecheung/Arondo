"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectTtsLanguage, splitSpeechChunks } from "@/lib/speechText";

export type SpeechStatus = "idle" | "loading" | "playing";
export interface SpeechError {
  kind: "not-configured" | "failed";
  message: string;
}

class SpeechRequestError extends Error {
  constructor(message: string, readonly notConfigured: boolean) {
    super(message);
  }
}

// Playing a silent clip synchronously inside the tap handler unlocks the element
// for later programmatic playback; iOS Safari blocks play() after an awaited fetch.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let stopActive: (() => void) | null = null;

async function fetchChunkUrl(text: string, lang: string): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new SpeechRequestError(error ?? `Text-to-speech failed (${res.status})`, res.status === 501);
  }
  return URL.createObjectURL(await res.blob());
}

function playUrl(audio: HTMLAudioElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed"));
    audio.src = url;
    audio.play().catch(reject);
  });
}

export function useSpeech() {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<SpeechError | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => stopRef.current?.(), []);

  const speak = useCallback(async (text: string) => {
    stopActive?.();

    const chunks = splitSpeechChunks(text);
    if (chunks.length === 0) return;
    const lang = detectTtsLanguage(text);

    const audio = new Audio(SILENT_WAV);
    audio.play().catch(() => {});

    let cancelled = false;
    const stopThis = () => {
      cancelled = true;
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      setStatus("idle");
      if (stopActive === stopThis) stopActive = null;
      if (stopRef.current === stopThis) stopRef.current = null;
    };
    stopActive = stopThis;
    stopRef.current = stopThis;
    setStatus("loading");

    try {
      let next = fetchChunkUrl(chunks[0], lang);
      for (let i = 0; i < chunks.length; i++) {
        const url = await next;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (i + 1 < chunks.length) next = fetchChunkUrl(chunks[i + 1], lang);
        setStatus("playing");
        await playUrl(audio, url);
        URL.revokeObjectURL(url);
        if (cancelled) return;
      }
      stopThis();
    } catch (err) {
      if (!cancelled) {
        stopThis();
        setError({
          kind: err instanceof SpeechRequestError && err.notConfigured ? "not-configured" : "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const clearError = useCallback(() => setError(null), []);

  return { status, error, clearError, speak, stop };
}
