"use client";

import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "@/components/admin/SettingsForm";
import type { AdminSettingsData } from "../settings-data";

type SessionSettings = {
  sessionArchiveDays: number | "";
  automationSessionRetentionHours: number | "";
  showHiddenFiles: boolean;
  showAutomationSessions: boolean;
};
const initial: SessionSettings = {
  sessionArchiveDays: "",
  automationSessionRetentionHours: "",
  showHiddenFiles: true,
  showAutomationSessions: false,
};
async function load(): Promise<SessionSettings> {
  const data = await settingsRequest<AdminSettingsData>("/api/settings");
  return {
    sessionArchiveDays: data.sessionArchiveDays,
    automationSessionRetentionHours: data.automationSessionRetentionHours,
    showHiddenFiles: data.showHiddenFiles ?? true,
    showAutomationSessions: data.showAutomationSessions === true,
  };
}
async function persist(draft: SessionSettings) {
  if (
    draft.sessionArchiveDays === "" ||
    !Number.isFinite(draft.sessionArchiveDays) ||
    draft.sessionArchiveDays < 1
  )
    throw new Error("Archive days must be at least one.");
  if (
    draft.automationSessionRetentionHours === "" ||
    !Number.isFinite(draft.automationSessionRetentionHours) ||
    draft.automationSessionRetentionHours <= 0
  )
    throw new Error("Automation retention hours must be greater than zero.");
  await settingsRequest("/api/settings", "POST", draft);
  return draft;
}
export default function SettingsPage() {
  const editor = useSettingsDraft(initial, load, persist);
  const { draft, setDraft } = editor;
  return (
    <SettingsForm editor={editor}>
      <h2>Session Management</h2>
      <SettingsField label="Idle days before automatic archiving">
        <input
          type="number"
          min={1}
          value={draft.sessionArchiveDays}
          onChange={(e) =>
            setDraft({
              ...draft,
              sessionArchiveDays:
                e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          style={settingsInputStyle}
        />
      </SettingsField>
      <SettingsField label="Automation session retention hours">
        <input
          type="number"
          min={0.01}
          step="any"
          value={draft.automationSessionRetentionHours}
          onChange={(e) =>
            setDraft({
              ...draft,
              automationSessionRetentionHours:
                e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          style={settingsInputStyle}
        />
      </SettingsField>
      <label>
        <input
          type="checkbox"
          checked={draft.showAutomationSessions}
          onChange={(e) =>
            setDraft({ ...draft, showAutomationSessions: e.target.checked })
          }
        />{" "}
        Show automation sessions
      </label>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
        Include automation sessions in lists, search, tasks, and completion
        notifications.
      </p>
      <h2 style={{ marginTop: 24 }}>File Browser</h2>
      <label>
        <input
          type="checkbox"
          checked={draft.showHiddenFiles}
          onChange={(e) =>
            setDraft({ ...draft, showHiddenFiles: e.target.checked })
          }
        />{" "}
        Show hidden files
      </label>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
        Show hidden files and directories in the file browser and @ path
        selector.
      </p>
    </SettingsForm>
  );
}
