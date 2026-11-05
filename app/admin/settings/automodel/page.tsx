"use client";
import styles from "@/components/admin/SettingsForm.module.css";
import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "@/components/admin/SettingsForm";
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

type Draft = {
  enabled: boolean;
  keys: Record<LlmApiKeyName, string>;
  status: Record<LlmApiKeyName, AutoModelApiKeyStatus>;
  removed: LlmApiKeyName[];
};
const initial: Draft = {
  enabled: false,
  keys: EMPTY_LLM_KEYS,
  status: EMPTY_LLM_STATUS,
  removed: [],
};
async function load(): Promise<Draft> {
  const data = await settingsRequest<AdminSettingsData>("/api/settings");
  return {
    ...initial,
    enabled: data.enableAutomodel === true,
    status: { ...EMPTY_LLM_STATUS, ...data.llmApiKeys },
  };
}
async function persist(draft: Draft): Promise<Draft> {
  const keys: Partial<Record<LlmApiKeyName, string | null>> = {};
  for (const { name } of LLM_API_KEYS) {
    if (draft.status[name].env) continue;
    if (draft.removed.includes(name)) keys[name] = null;
    else if (draft.keys[name].trim()) keys[name] = draft.keys[name].trim();
  }
  const data = await settingsRequest<AdminSettingsData>(
    "/api/settings",
    "POST",
    { enableAutomodel: draft.enabled, llmApiKeys: keys },
  );
  return {
    ...initial,
    enabled: draft.enabled,
    status: { ...draft.status, ...data.llmApiKeys },
  };
}
export default function SettingsPage() {
  const editor = useSettingsDraft(initial, load, persist);
  const { draft, setDraft } = editor;
  return (
    <SettingsForm editor={editor}>
      <h2>Automodel &amp; LLM API Keys</h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "8px 0 16px",
        }}
      >
        Automodel chooses the model and reasoning effort for single-use sessions
        after Auto Mode selects an agent. Environment variables take precedence
        over saved keys. Without a configured key, Arondo uses the default
        model.
      </p>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />{" "}
        Enable automodel
      </label>
      <div style={{ marginTop: 24 }}>
        {LLM_API_KEYS.map(({ name, label, description }) => (
          <div key={name} className={styles.card}>
            <SettingsField label={label}>
              <input
                type="password"
                autoComplete="new-password"
                disabled={draft.status[name].env}
                value={draft.keys[name]}
                placeholder={
                  draft.status[name].env
                    ? "Configured by environment variable"
                    : draft.removed.includes(name)
                      ? "Key will be removed on Save"
                      : draft.status[name].configured
                        ? "Saved key (leave blank to keep)"
                        : name
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    keys: { ...draft.keys, [name]: e.target.value },
                    removed: draft.removed.filter((key) => key !== name),
                  })
                }
                style={settingsInputStyle}
              />
            </SettingsField>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {description}
            </p>
            {!draft.status[name].env &&
              draft.status[name].source === "settings" && (
                <button
                  type="button"
                  className={
                    draft.removed.includes(name)
                      ? undefined
                      : styles.dangerButton
                  }
                  onClick={() =>
                    setDraft({
                      ...draft,
                      keys: { ...draft.keys, [name]: "" },
                      removed: draft.removed.includes(name)
                        ? draft.removed.filter((key) => key !== name)
                        : [...draft.removed, name],
                    })
                  }
                  style={{ marginTop: 8 }}
                >
                  {draft.removed.includes(name) ? "Undo removal" : "Remove key"}
                </button>
              )}
          </div>
        ))}
      </div>
    </SettingsForm>
  );
}
