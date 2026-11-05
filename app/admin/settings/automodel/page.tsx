"use client";
import { useState, useEffect, useCallback } from "react";
import type { AdminSettingsData } from "../settings-data";
type LlmApiKeyName =
  | "TYPESAFE_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "OPENAI_API_KEY"
  | "GOOGLE_GENERATIVE_AI_API_KEY";
interface AutoModelApiKeyStatus {
  configured: boolean;
  source: "env" | "settings" | "none";
  env: boolean;
}
const LLM_API_KEYS: {
  name: LlmApiKeyName;
  label: string;
  description: string;
}[] = [
  {
    name: "TYPESAFE_API_KEY",
    label: "Jev (TypeSafe AI)",
    description:
      "Highest priority System One router for choosing model and effort.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    description:
      "Standard LLM router (first priority when Jev is unconfigured).",
  },
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI",
    description: "Standard LLM router (second priority).",
  },
  {
    name: "GOOGLE_GENERATIVE_AI_API_KEY",
    label: "Google",
    description: "Standard LLM router (third priority).",
  },
];
const EMPTY_LLM_KEYS: Record<LlmApiKeyName, string> = {
  TYPESAFE_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
};
const EMPTY_LLM_STATUS: Record<LlmApiKeyName, AutoModelApiKeyStatus> = {
  TYPESAFE_API_KEY: { configured: false, source: "none", env: false },
  ANTHROPIC_API_KEY: { configured: false, source: "none", env: false },
  OPENAI_API_KEY: { configured: false, source: "none", env: false },
  GOOGLE_GENERATIVE_AI_API_KEY: {
    configured: false,
    source: "none",
    env: false,
  },
};
export default function SettingsPage() {
  const [enableAutomodel, setEnableAutomodel] = useState(false);
  const [savingEnableAutomodel, setSavingEnableAutomodel] = useState(false);
  const [llmApiKeys, setLlmApiKeys] =
    useState<Record<LlmApiKeyName, string>>(EMPTY_LLM_KEYS);
  const [llmApiKeyStatus, setLlmApiKeyStatus] =
    useState<Record<LlmApiKeyName, AutoModelApiKeyStatus>>(EMPTY_LLM_STATUS);
  const [savingLlmApiKeys, setSavingLlmApiKeys] = useState(false);
  const [llmApiKeysSaved, setLlmApiKeysSaved] = useState(false);
  const handleToggleEnableAutomodel = useCallback(async (checked: boolean) => {
    setEnableAutomodel(checked);
    setSavingEnableAutomodel(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableAutomodel: checked }),
      });
      if (!res.ok) {
        setEnableAutomodel(!checked);
        alert("Failed to save automodel setting");
      }
    } catch (err) {
      console.error("Failed to save automodel setting:", err);
      setEnableAutomodel(!checked);
    } finally {
      setSavingEnableAutomodel(false);
    }
  }, []);
  const saveLlmApiKeys = useCallback(
    async (patch: Partial<Record<LlmApiKeyName, string | null>>) => {
      setSavingLlmApiKeys(true);
      setLlmApiKeysSaved(false);
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ llmApiKeys: patch }),
        });
        if (!res.ok) {
          alert("Failed to save automodel API keys");
          return;
        }
        const data = await res.json();
        if (data.llmApiKeys) {
          setLlmApiKeyStatus({ ...EMPTY_LLM_STATUS, ...data.llmApiKeys });
        }
        setLlmApiKeys(EMPTY_LLM_KEYS);
        setLlmApiKeysSaved(true);
        setTimeout(() => setLlmApiKeysSaved(false), 3000);
      } catch (err) {
        console.error("Failed to save automodel API keys:", err);
        alert("Failed to save automodel API keys");
      } finally {
        setSavingLlmApiKeys(false);
      }
    },
    [],
  );
  const handleSaveLlmApiKeys = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const patch: Partial<Record<LlmApiKeyName, string>> = {};
      for (const { name } of LLM_API_KEYS) {
        if (llmApiKeyStatus[name].env) continue;
        const value = llmApiKeys[name].trim();
        if (value) patch[name] = value;
      }
      if (Object.keys(patch).length === 0) return;
      await saveLlmApiKeys(patch);
    },
    [llmApiKeys, llmApiKeyStatus, saveLlmApiKeys],
  );
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AdminSettingsData) => {
        if (data.enableAutomodel !== undefined)
          setEnableAutomodel(data.enableAutomodel);
        if (data.llmApiKeys)
          setLlmApiKeyStatus({ ...EMPTY_LLM_STATUS, ...data.llmApiKeys });
      })
      .catch(console.error);
  }, []);

  return (
    <>
      <section
        aria-label="Automodel and LLM API keys"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            Automodel &amp; LLM API Keys
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Automodel dynamically chooses the model and reasoning effort after
            Auto Mode has selected an agent. Note that automodel only applies to
            single-use (--once) sessions; standard multi-turn resume sessions
            use the agent&apos;s default model to prevent frequent model
            switching. These keys are optional; if automodel is disabled or no
            key is configured, Arondo uses the default model. Keys are checked
            in priority order: Anthropic, OpenAI, then Google. Environment
            variables take precedence over values saved here.
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-primary)",
              cursor: savingEnableAutomodel ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={enableAutomodel}
              disabled={savingEnableAutomodel}
              onChange={(e) => handleToggleEnableAutomodel(e.target.checked)}
              style={{ cursor: savingEnableAutomodel ? "default" : "pointer" }}
            />
            <span>Enable automodel</span>
          </label>
        </div>

        <form
          onSubmit={handleSaveLlmApiKeys}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {LLM_API_KEYS.map(({ name, label, description }) => {
            const status = llmApiKeyStatus[name];
            const disabled = status.env || savingLlmApiKeys;
            const placeholder = status.env
              ? "Configured by environment variable"
              : status.source === "settings"
                ? "Saved in arondo.json"
                : name;
            return (
              <div
                key={name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {label}
                  </span>
                  <input
                    type="password"
                    value={llmApiKeys[name]}
                    disabled={disabled}
                    autoComplete="off"
                    placeholder={placeholder}
                    onChange={(e) =>
                      setLlmApiKeys((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "7px 10px",
                      fontSize: 13,
                      backgroundColor: disabled
                        ? "var(--bg-base)"
                        : "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-primary)",
                      outline: "none",
                      opacity: disabled ? 0.65 : 1,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: status.env
                        ? "var(--text-secondary)"
                        : "var(--text-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {description}{" "}
                    {status.env
                      ? `${name} is set on the server, so this value cannot be edited here.`
                      : status.source === "settings"
                        ? "A saved key is active."
                        : "No key configured."}
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    !status.configured ||
                    status.source !== "settings"
                  }
                  onClick={() => saveLlmApiKeys({ [name]: null })}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor:
                      disabled ||
                      !status.configured ||
                      status.source !== "settings"
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      disabled ||
                      !status.configured ||
                      status.source !== "settings"
                        ? 0.5
                        : 1,
                  }}
                >
                  Clear
                </button>
              </div>
            );
          })}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              disabled={
                savingLlmApiKeys ||
                !LLM_API_KEYS.some(
                  ({ name }) =>
                    !llmApiKeyStatus[name].env && llmApiKeys[name].trim(),
                )
              }
              style={{
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor:
                  savingLlmApiKeys ||
                  !LLM_API_KEYS.some(
                    ({ name }) =>
                      !llmApiKeyStatus[name].env && llmApiKeys[name].trim(),
                  )
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  savingLlmApiKeys ||
                  !LLM_API_KEYS.some(
                    ({ name }) =>
                      !llmApiKeyStatus[name].env && llmApiKeys[name].trim(),
                  )
                    ? 0.5
                    : 1,
              }}
            >
              {savingLlmApiKeys ? "Saving…" : "Save API Keys"}
            </button>
            {llmApiKeysSaved && (
              <span
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  fontWeight: 500,
                }}
              >
                Saved
              </span>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
