"use client";

import styles from "./SettingsForm.module.css";
import SettingsForm, {
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "./SettingsForm";
import type { Runner, TokenInfo } from "@/app/admin/settings/settings-data";

type Draft = { runners: Runner[]; content: string; users: TokenInfo[] };
const initial: Draft = { runners: [], content: "", users: [] };
async function loadRules(): Promise<Draft> {
  const [runners, rules] = await Promise.all([
    settingsRequest<Runner[]>("/api/runners"),
    settingsRequest<{ content: string }>("/api/global-rules"),
  ]);
  return { ...initial, runners, content: rules.content };
}
async function loadAccess(): Promise<Draft> {
  const [runners, users] = await Promise.all([
    settingsRequest<Runner[]>("/api/runners"),
    settingsRequest<TokenInfo[]>("/api/auth/client-tokens"),
  ]);
  return {
    ...initial,
    runners,
    users: users.filter((user) => user.type === "user"),
  };
}
async function persist(
  draft: Draft,
  saved: Draft,
  checkpoint: (value: Draft) => void,
  rules: boolean,
) {
  let committed = saved;
  for (const runner of draft.runners) {
    const previous = committed.runners.find((r) => r.id === runner.id);
    const changed = rules
      ? (runner.syncGlobalRules !== false) !==
        (previous?.syncGlobalRules !== false)
      : JSON.stringify(runner.allowedUserTokenUuids ?? []) !==
        JSON.stringify(previous?.allowedUserTokenUuids ?? []);
    if (!changed) continue;
    await settingsRequest("/api/runners", "POST", {
      id: runner.id,
      ...(rules
        ? { syncGlobalRules: runner.syncGlobalRules !== false }
        : { allowedUserTokenUuids: runner.allowedUserTokenUuids ?? [] }),
    });
    committed = {
      ...committed,
      runners: committed.runners.map((r) => (r.id === runner.id ? runner : r)),
    };
    checkpoint(committed);
  }
  if (rules && draft.content !== committed.content) {
    await settingsRequest("/api/global-rules", "POST", {
      content: draft.content,
    });
  }
  return draft;
}
const persistRules = (
  draft: Draft,
  saved: Draft,
  checkpoint: (value: Draft) => void,
) => persist(draft, saved, checkpoint, true);
const persistAccess = (
  draft: Draft,
  saved: Draft,
  checkpoint: (value: Draft) => void,
) => persist(draft, saved, checkpoint, false);

export default function RunnerSettings({ rules = false }: { rules?: boolean }) {
  const editor = useSettingsDraft(
    initial,
    rules ? loadRules : loadAccess,
    rules ? persistRules : persistAccess,
  );
  const { draft, setDraft } = editor;
  function updateRunner(id: string, patch: Partial<Runner>) {
    setDraft({
      ...draft,
      runners: draft.runners.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
  return (
    <SettingsForm editor={editor}>
      <h2>{rules ? "Global Agent Rules" : "Runner Access Control"}</h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "8px 0 16px",
        }}
      >
        {rules
          ? "Define global rules for all agents and choose which runners receive them."
          : "Choose which users can access each runner. Runners with no selected users are admin-only."}
      </p>
      {rules && (
        <p
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Rules sync to <code>~/.gemini/GEMINI.md</code>,{" "}
          <code>~/.claude/CLAUDE.md</code>, <code>~/.codex/AGENTS.md</code>, and{" "}
          <code>~/.config/opencode/AGENTS.md</code>.
        </p>
      )}
      {draft.runners.length === 0 && (
        <p className={styles.empty}>No runners found.</p>
      )}
      {draft.runners.map((runner) => (
        <div key={runner.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <span
              className={`task-status-badge ${runner.connected ? "running" : "idle"}`}
            >
              {runner.connected ? "connected" : "disconnected"}
            </span>
            {runner.name}{" "}
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              ({runner.hostname})
            </span>
          </div>
          {rules ? (
            <label className={styles.userOption}>
              <input
                type="checkbox"
                checked={runner.syncGlobalRules !== false}
                onChange={(e) =>
                  updateRunner(runner.id, { syncGlobalRules: e.target.checked })
                }
              />{" "}
              Sync global rules to {runner.name}
            </label>
          ) : draft.users.length === 0 ? (
            <p>
              No user tokens configured. Create one in System Access Tokens.
            </p>
          ) : (
            draft.users.map((user) => (
              <label key={user.uuid} className={styles.userOption}>
                <input
                  type="checkbox"
                  checked={(runner.allowedUserTokenUuids ?? []).includes(
                    user.uuid,
                  )}
                  onChange={(e) =>
                    updateRunner(runner.id, {
                      allowedUserTokenUuids: e.target.checked
                        ? [...(runner.allowedUserTokenUuids ?? []), user.uuid]
                        : (runner.allowedUserTokenUuids ?? []).filter(
                            (id) => id !== user.uuid,
                          ),
                    })
                  }
                />
                <span
                  className={styles.avatar}
                  style={{
                    background: user.color || "var(--accent)",
                    width: 20,
                    height: 20,
                    fontSize: 9,
                  }}
                  aria-hidden="true"
                >
                  {user.name.charAt(0) || "?"}
                </span>
                {user.name}
              </label>
            ))
          )}
        </div>
      ))}
      {rules && (
        <label style={{ display: "block", marginTop: 16 }}>
          Global rules
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={12}
            style={{
              ...settingsInputStyle,
              marginTop: 8,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        </label>
      )}
    </SettingsForm>
  );
}
