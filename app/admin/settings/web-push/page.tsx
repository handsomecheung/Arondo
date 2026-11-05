"use client";

import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "@/components/admin/SettingsForm";
import type { AdminSettingsData } from "../settings-data";
async function load() {
  const data = await settingsRequest<AdminSettingsData>("/api/settings");
  return data.webPushContactEmail ?? "";
}
async function persist(email: string) {
  const data = await settingsRequest<AdminSettingsData>(
    "/api/settings",
    "POST",
    { webPushContactEmail: email },
  );
  return data.webPushContactEmail ?? email;
}
export default function SettingsPage() {
  const editor = useSettingsDraft("", load, persist);
  return (
    <SettingsForm editor={editor}>
      <h2>Web Push Notification (VAPID Contact Email)</h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "8px 0 16px",
        }}
      >
        The contact email or URL included in the VAPID <code>sub</code> claim
        sent to push services. Persisted to <code>~/.arondo/web-push.json</code>
        .
      </p>
      <SettingsField label="Admin Contact Email">
        <input
          type="text"
          value={editor.draft}
          onChange={(e) => editor.setDraft(e.target.value)}
          placeholder="e.g. admin@example.com"
          style={settingsInputStyle}
        />
      </SettingsField>
    </SettingsForm>
  );
}
