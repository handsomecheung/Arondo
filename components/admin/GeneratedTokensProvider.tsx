"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import styles from "./SettingsForm.module.css";
import { settingsInputStyle } from "./SettingsForm";

const GeneratedTokensContext = createContext<
  ((tokens: string[]) => void) | null
>(null);
export function useGeneratedTokens() {
  return useContext(GeneratedTokensContext)!;
}

export default function GeneratedTokensProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tokens, setTokens] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (tokens.length) dialog.current?.showModal();
  }, [tokens]);
  return (
    <GeneratedTokensContext.Provider value={setTokens}>
      {children}
      <dialog
        className={styles.section}
        ref={dialog}
        onClose={() => setTokens([])}
        aria-labelledby="generated-tokens-title"
        style={{
          margin: "auto",
          padding: 24,
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          color: "var(--text-primary)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <h2 id="generated-tokens-title">Generated tokens</h2>
        <p style={{ margin: "8px 0 16px", fontSize: 13 }}>
          Copy and store these tokens securely.
        </p>
        {tokens.map((token) => (
          <div key={token} style={{ marginBottom: 16 }}>
            <label>
              Generated token
              <input
                readOnly
                value={token}
                onClick={(event) => event.currentTarget.select()}
                style={{ ...settingsInputStyle, margin: "8px 0" }}
              />
            </label>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(token)}
            >
              Copy token
            </button>
          </div>
        ))}
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </GeneratedTokensContext.Provider>
  );
}
