"use client";

import { useState, useEffect } from "react";
import type { AgentModelsConfig } from "@/lib/store";

interface AgentModelsManagerProps {
  initialConfig?: AgentModelsConfig;
  onSaved?: (updated: AgentModelsConfig) => void;
}

interface GroupFormState {
  defaultModel: string;
  availableModelsText: string;
}

interface FormState {
  antigravityGemini: GroupFormState;
  antigravityOther: GroupFormState;
  claude: GroupFormState;
  codex: GroupFormState;
}

const DEFAULT_CONFIGS: AgentModelsConfig = {
  antigravity: {
    gemini: {
      defaultModel: "Gemini 3.5 Flash (Medium)",
      availableModels: [
        "Gemini 3.7 Flash (High)",
        "Gemini 3.7 Flash (Medium)",
        "Gemini 3.7 Flash (Low)",
        "Gemini 3.6 Flash (High)",
        "Gemini 3.6 Flash (Medium)",
        "Gemini 3.6 Flash (Low)",
        "Gemini 3.5 Flash (High)",
        "Gemini 3.5 Flash (Medium)",
        "Gemini 3.5 Flash (Low)",
        "Gemini 3.1 Pro (High)",
        "Gemini 3.1 Pro (Low)",
      ],
    },
    other: {
      defaultModel: "Claude Sonnet 4.6 (Thinking)",
      availableModels: [
        "Claude Sonnet 4.6 (Thinking)",
        "Claude Opus 4.6 (Thinking)",
        "GPT-OSS 120B (Medium) # Coding performance may be suboptimal; prefix with '#' to comment out if needed",
      ],
    },
  },
  claude: {
    defaultModel: "claude-3-7-sonnet-20250219",
    availableModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
  },
  codex: {
    defaultModel: "gpt-5.5 medium",
    availableModels: [
      "gpt-5.4-mini low",
      "gpt-5.5 medium",
      "gpt-5.5 high",
    ],
  },
};

function configToFormState(config?: AgentModelsConfig): FormState {
  return {
    antigravityGemini: {
      defaultModel: config?.antigravity?.gemini?.defaultModel ?? DEFAULT_CONFIGS.antigravity.gemini.defaultModel ?? "",
      availableModelsText: (config?.antigravity?.gemini?.availableModels ?? DEFAULT_CONFIGS.antigravity.gemini.availableModels ?? []).join("\n"),
    },
    antigravityOther: {
      defaultModel: config?.antigravity?.other?.defaultModel ?? DEFAULT_CONFIGS.antigravity.other.defaultModel ?? "",
      availableModelsText: (config?.antigravity?.other?.availableModels ?? DEFAULT_CONFIGS.antigravity.other.availableModels ?? []).join("\n"),
    },
    claude: {
      defaultModel: config?.claude?.defaultModel ?? DEFAULT_CONFIGS.claude.defaultModel ?? "",
      availableModelsText: (config?.claude?.availableModels ?? DEFAULT_CONFIGS.claude.availableModels ?? []).join("\n"),
    },
    codex: {
      defaultModel: config?.codex?.defaultModel ?? DEFAULT_CONFIGS.codex.defaultModel ?? "",
      availableModelsText: (config?.codex?.availableModels ?? DEFAULT_CONFIGS.codex.availableModels ?? []).join("\n"),
    },
  };
}

export default function AgentModelsManager({ initialConfig, onSaved }: AgentModelsManagerProps) {
  const [form, setForm] = useState<FormState>(() => configToFormState(initialConfig));
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setForm(configToFormState(initialConfig));
    }
  }, [initialConfig]);

  const handleChange = (field: keyof FormState, key: keyof GroupFormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        [key]: value,
      },
    }));
  };

  const handleResetAgyGroup = (group: "gemini" | "other") => {
    const def = DEFAULT_CONFIGS.antigravity[group];
    const fieldKey: keyof FormState = group === "gemini" ? "antigravityGemini" : "antigravityOther";
    setForm((prev) => ({
      ...prev,
      [fieldKey]: {
        defaultModel: def.defaultModel ?? "",
        availableModelsText: (def.availableModels ?? []).join("\n"),
      },
    }));
  };

  const handleResetAgent = (agent: "claude" | "codex") => {
    const def = DEFAULT_CONFIGS[agent];
    setForm((prev) => ({
      ...prev,
      [agent]: {
        defaultModel: def.defaultModel ?? "",
        availableModelsText: (def.availableModels ?? []).join("\n"),
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    const payload: AgentModelsConfig = {
      antigravity: {
        gemini: {
          defaultModel: form.antigravityGemini.defaultModel.trim(),
          availableModels: form.antigravityGemini.availableModelsText
            .split("\n")
            .map((m) => m.trim())
            .filter(Boolean),
        },
        other: {
          defaultModel: form.antigravityOther.defaultModel.trim(),
          availableModels: form.antigravityOther.availableModelsText
            .split("\n")
            .map((m) => m.trim())
            .filter(Boolean),
        },
      },
      claude: {
        defaultModel: form.claude.defaultModel.trim(),
        availableModels: form.claude.availableModelsText
          .split("\n")
          .map((m) => m.trim())
          .filter(Boolean),
      },
      codex: {
        defaultModel: form.codex.defaultModel.trim(),
        availableModels: form.codex.availableModelsText
          .split("\n")
          .map((m) => m.trim())
          .filter(Boolean),
      },
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentModels: payload }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        onSaved?.(payload);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert("Failed to save agent model settings");
      }
    } catch (err) {
      console.error("Failed to save agent models:", err);
      alert("Error occurred while saving agent models");
    } finally {
      setSaving(false);
    }
  };

  const renderGroupCard = (
    title: string,
    description: string,
    state: GroupFormState,
    onChangeField: (key: keyof GroupFormState, val: string) => void,
    onReset: () => void,
    defaultPlaceholder: string,
    availablePlaceholder: string,
    idPrefix: string,
  ) => {
    const modelCount = state.availableModelsText
      .split("\n")
      .map((m) => {
        const hashIdx = m.indexOf("#");
        return (hashIdx >= 0 ? m.slice(0, hashIdx) : m).trim();
      })
      .filter(Boolean).length;

    return (
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              {title}
            </h4>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
            title="Reset this model group to default"
          >
            Reset
          </button>
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-default`}
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 4,
            }}
          >
            Default Model
          </label>
          <input
            id={`${idPrefix}-default`}
            type="text"
            value={state.defaultModel}
            onChange={(e) => onChangeField("defaultModel", e.target.value)}
            placeholder={defaultPlaceholder}
            style={{
              width: "100%",
              padding: "7px 10px",
              fontSize: 13,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label
              htmlFor={`${idPrefix}-available`}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Available Models (one per line, # comments supported)
            </label>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {modelCount} {modelCount === 1 ? "model" : "models"}
            </span>
          </div>
          <textarea
            id={`${idPrefix}-available`}
            rows={Math.max(3, Math.min(8, state.availableModelsText.split("\n").length + 1))}
            value={state.availableModelsText}
            onChange={(e) => onChangeField("availableModelsText", e.target.value)}
            placeholder={availablePlaceholder}
            style={{
              width: "100%",
              padding: "7px 10px",
              fontSize: 12,
              lineHeight: 1.5,
              fontFamily: "monospace",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Agent Model Settings"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          Agent Models & Defaults
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0, lineHeight: 1.5 }}>
          Configure default models and available models for Antigravity (Gemini &amp; Others), Claude Code, and Codex. Model names support comments starting with <code>#</code> (e.g. <code>Model Name # notes</code> or full-line comments), and empty/comment lines will be automatically ignored. Saved in arondo.json.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Antigravity CLI Group */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Antigravity CLI (agy)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {renderGroupCard(
              "Gemini Group",
              "Models counted against Antigravity Gemini quota tier.",
              form.antigravityGemini,
              (k, v) => handleChange("antigravityGemini", k, v),
              () => handleResetAgyGroup("gemini"),
              "e.g. Gemini 3.7 Flash (Medium)",
              "Gemini 3.7 Flash (High) # Fast reasoning\nGemini 3.7 Flash (Medium)\n# Gemini 3.5 Flash (Low)",
              "agy-gemini",
            )}
            {renderGroupCard(
              "Others Group",
              "Non-Gemini models (Claude/Other) counted against Antigravity Other quota tier.",
              form.antigravityOther,
              (k, v) => handleChange("antigravityOther", k, v),
              () => handleResetAgyGroup("other"),
              "e.g. Claude Sonnet 4.6 (Thinking)",
              "Claude Sonnet 4.6 (Thinking) # Default thinking model\nClaude Opus 4.6 (Thinking)",
              "agy-other",
            )}
          </div>
        </div>

        {/* Claude Code */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Claude Code (claude)
          </h3>
          {renderGroupCard(
            "Claude Code Models",
            "Configure default model and model options passed to the claude CLI.",
            form.claude,
            (k, v) => handleChange("claude", k, v),
            () => handleResetAgent("claude"),
            "e.g. claude-3-7-sonnet-20250219",
            "claude-3-7-sonnet-20250219 # Hybrid reasoning\nclaude-3-5-sonnet-20241022\n# claude-3-5-haiku-20241022",
            "claude",
          )}
        </div>

        {/* Codex CLI */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Codex CLI (codex)
          </h3>
          {renderGroupCard(
            "Codex Models & Effort",
            "Configure default model and reasoning effort options passed to OpenAI Codex.",
            form.codex,
            (k, v) => handleChange("codex", k, v),
            () => handleResetAgent("codex"),
            "e.g. gpt-5.5 medium",
            "gpt-5.4-mini low\ngpt-5.5 medium # Standard\ngpt-5.5 high # Heavy reasoning",
            "codex",
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "#ffffff",
              background: "var(--accent, #3b82f6)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Agent Models"}
          </button>
          {savedSuccess && (
            <span style={{ fontSize: 12, color: "var(--success, #22c55e)", fontWeight: 500 }}>
              ✓ Agent models saved successfully
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
