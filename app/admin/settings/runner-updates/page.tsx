"use client";

import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "@/components/admin/SettingsForm";
import {
  DEFAULT_RUNNER_DOWNLOAD_URL,
  getRunnerDownloadUrlError,
} from "@/lib/runner-update-settings";
import type { AdminSettingsData } from "../settings-data";

async function load(): Promise<string> {
  const data = await settingsRequest<AdminSettingsData>("/api/settings");
  return data.runnerDownloadUrl ?? DEFAULT_RUNNER_DOWNLOAD_URL;
}

async function persist(draft: string) {
  const error = getRunnerDownloadUrlError(draft);
  if (error) throw new Error(error);
  const runnerDownloadUrl = draft.trim();
  await settingsRequest("/api/settings", "POST", { runnerDownloadUrl });
  return runnerDownloadUrl;
}

export default function SettingsPage() {
  const editor = useSettingsDraft(DEFAULT_RUNNER_DOWNLOAD_URL, load, persist);
  return (
    <SettingsForm editor={editor}>
      <SettingsField label="Runner download URL template">
        <textarea
          value={editor.draft}
          onChange={(event) => editor.setDraft(event.target.value)}
          rows={4}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-describedby="runner-download-url-help"
          style={{ ...settingsInputStyle, resize: "vertical" }}
        />
      </SettingsField>
      <p id="runner-download-url-help" style={{ color: "var(--text-muted)", fontSize: 12 }}>
        Use <code>{"${version}"}</code> for the server version, <code>{"${os}"}</code> for
        the runner OS (linux or macos), and <code>{"${arch}"}</code> for its architecture
        (amd64 or arm64). Older runners receive a notice when they connect.
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
        Runners currently log the download URL for manual updating.
      </p>
      <button type="button" onClick={() => editor.setDraft(DEFAULT_RUNNER_DOWNLOAD_URL)}>
        Use default URL
      </button>
    </SettingsForm>
  );
}
