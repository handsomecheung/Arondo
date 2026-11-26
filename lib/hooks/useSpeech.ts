"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectTtsLanguage, type SpeechParagraph } from "@/lib/speechText";

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

export interface SpeechScope {
  sessionId: string;
  projectId?: string;
}

async function fetchChunkUrl(text: string, lang: string, scope: SpeechScope): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, ...scope }),
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
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  const speakAll = useCallback(
    async (paragraphs: SpeechParagraph[], scope: SpeechScope) => {
      stopActive?.();

      const items = paragraphs.filter((p) => p.text.trim().length > 0);
      if (items.length === 0) return;

      const fullText = items.map((p) => p.text).join(" ");
      const lang = detectTtsLanguage(fullText);

      const audio = new Audio(SILENT_WAV);
      audio.play().catch(() => {});

      let cancelled = false;
      let currentEl: HTMLElement | null = null;

      const clearActiveElement = () => {
        if (currentEl) {
          currentEl.classList.remove("speech-active");
          currentEl.querySelector(".agent-paragraph-speaker-btn")?.classList.remove("is-active");
          currentEl = null;
        }
      };

      const stopThis = () => {
        cancelled = true;
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        clearActiveElement();
        setStatus("idle");
        setActiveElement(null);
        if (stopActive === stopThis) stopActive = null;
        if (stopRef.current === stopThis) stopRef.current = null;
      };
      stopActive = stopThis;
      stopRef.current = stopThis;
      setStatus("loading");

      try {
        let next = fetchChunkUrl(items[0].text, lang, scope);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const url = await next;
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (i + 1 < items.length) {
            next = fetchChunkUrl(items[i + 1].text, lang, scope);
          }

          clearActiveElement();
          currentEl = item.element;
          currentEl.classList.add("speech-active");
          currentEl.querySelector(".agent-paragraph-speaker-btn")?.classList.add("is-active");
          setActiveElement(item.element);
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
    },
    []
  );

  const speakParagraph = useCallback(
    async (paragraph: SpeechParagraph, scope: SpeechScope) => {
      // Toggle off if currently playing this exact element
      if (activeElement === paragraph.element && status !== "idle") {
        stop();
        return;
      }

      stopActive?.();

      const text = paragraph.text.trim();
      if (!text) return;
      const lang = detectTtsLanguage(text);

      const audio = new Audio(SILENT_WAV);
      audio.play().catch(() => {});

      let cancelled = false;
      let currentEl: HTMLElement | null = paragraph.element;

      const clearActiveElement = () => {
        if (currentEl) {
          currentEl.classList.remove("speech-active");
          currentEl.querySelector(".agent-paragraph-speaker-btn")?.classList.remove("is-active");
          currentEl = null;
        }
      };

      const stopThis = () => {
        cancelled = true;
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        clearActiveElement();
        setStatus("idle");
        setActiveElement(null);
        if (stopActive === stopThis) stopActive = null;
        if (stopRef.current === stopThis) stopRef.current = null;
      };
      stopActive = stopThis;
      stopRef.current = stopThis;

      currentEl.classList.add("speech-active");
      currentEl.querySelector(".agent-paragraph-speaker-btn")?.classList.add("is-active");
      setActiveElement(paragraph.element);
      setStatus("loading");

      try {
        const url = await fetchChunkUrl(text, lang, scope);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setStatus("playing");
        await playUrl(audio, url);
        URL.revokeObjectURL(url);
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
    },
    [activeElement, status, stop]
  );

  // Fallback single-string speech
  const speak = useCallback(
    (text: string, scope: SpeechScope) => {
      const dummy = document.createElement("div");
      return speakParagraph({ element: dummy, text }, scope);
    },
    [speakParagraph]
  );

  useEffect(() => () => stopRef.current?.(), []);

  const clearError = useCallback(() => setError(null), []);

  return { status, error, clearError, speakAll, speakParagraph, speak, activeElement, stop };
}
