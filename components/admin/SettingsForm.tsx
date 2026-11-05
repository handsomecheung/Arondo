"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SettingsForm.module.css";

export async function settingsRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to save settings");
  }
  return response.json();
}

type Persist<T> = (
  draft: T,
  saved: T,
  checkpoint: (value: T) => void,
) => Promise<T>;

export function useSettingsDraft<T>(
  initial: T,
  load: () => Promise<T>,
  persist: Persist<T>,
) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const baseline = useRef(initial);

  useEffect(() => {
    let disposed = false;
    load()
      .then((value) => {
        if (disposed) return;
        baseline.current = value;
        setDraft(value);
        setLoading(false);
      })
      .catch((err) => {
        if (!disposed) setError(err.message);
      });
    return () => {
      disposed = true;
    };
  }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const checkpoint = (value: T) => {
        baseline.current = value;
      };
      const value = await persist(draft, baseline.current, checkpoint);
      checkpoint(value);
      setDraft(value);
      router.push("/admin/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    router.push("/admin/settings");
  }

  return {
    draft,
    setDraft,
    loading,
    saving,
    error,
    save,
    cancel,
  };
}

export function SettingsActions({
  saving,
  disabled,
  onSave,
  onCancel,
}: {
  saving: boolean;
  disabled?: boolean;
  onSave?: () => void;
  onCancel: () => void;
}) {
  const buttonStyle = {
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: "var(--radius-sm)",
    cursor: saving || disabled ? "default" : "pointer",
    opacity: saving || disabled ? 0.5 : 1,
  };
  return (
    <div className={styles.actions}>
      <button
        type={onSave ? "button" : "submit"}
        onClick={onSave}
        disabled={saving || disabled}
        style={{
          ...buttonStyle,
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "#fff",
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving || disabled}
        style={{
          ...buttonStyle,
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

export default function SettingsForm({
  editor,
  children,
}: {
  editor: {
    loading: boolean;
    saving: boolean;
    error: string;
    save: () => Promise<void>;
    cancel: () => void;
  };
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <fieldset
        disabled={editor.loading || editor.saving}
        className={styles.content}
      >
        {children}
      </fieldset>
      {editor.loading && !editor.error && <p role="status">Loading…</p>}
      {editor.error && (
        <p role="alert" style={{ color: "var(--error)" }}>
          {editor.error}
        </p>
      )}
      <SettingsActions
        saving={editor.saving}
        disabled={editor.loading}
        onSave={() => void editor.save()}
        onCancel={editor.cancel}
      />
    </section>
  );
}

export const settingsInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  color: "var(--text-primary)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
} as const;

export function SettingsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      {label}
      {children}
    </label>
  );
}
