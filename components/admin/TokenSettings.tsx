"use client";

import styles from "./SettingsForm.module.css";
import { useGeneratedTokens } from "./GeneratedTokensProvider";
import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "./SettingsForm";

type Token = {
  token: string;
  name: string;
  uuid?: string;
  id?: string;
  type?: "admin" | "user";
  runnerName?: string;
  connected?: boolean;
  color?: string;
};
type Draft = { tokens: Token[]; newName: string; generated: string[] };
const initial: Draft = { tokens: [], newName: "", generated: [] };
const clientUrl = "/api/auth/client-tokens";
const runnerUrl = "/api/auth/runner-tokens";
const loadClients = async (): Promise<Draft> => ({
  ...initial,
  tokens: await settingsRequest<Token[]>(clientUrl),
});
const loadRunners = async (): Promise<Draft> => ({
  ...initial,
  tokens: await settingsRequest<Token[]>(runnerUrl),
});
async function persist(
  draft: Draft,
  saved: Draft,
  checkpoint: (value: Draft) => void,
  runner: boolean,
) {
  if (draft.tokens.some((token) => !token.name.trim()))
    throw new Error("Token names cannot be empty.");
  const url = runner ? runnerUrl : clientUrl;
  let committed = saved;
  for (const token of draft.tokens) {
    const previous = committed.tokens.find((old) => old.token === token.token);
    if (previous?.name === token.name.trim()) continue;
    await settingsRequest(
      url,
      "PUT",
      runner
        ? { id: token.id, name: token.name.trim() }
        : { role: token.type, token: token.token, name: token.name.trim() },
    );
    committed = {
      ...committed,
      tokens: committed.tokens.map((old) =>
        old.token === token.token ? { ...token, name: token.name.trim() } : old,
      ),
    };
    checkpoint(committed);
  }
  for (const token of saved.tokens) {
    if (draft.tokens.some((item) => item.token === token.token)) continue;
    await settingsRequest(
      url +
        (runner
          ? "?id=" + encodeURIComponent(token.id!)
          : "?role=" +
            token.type +
            "&token=" +
            encodeURIComponent(token.token)),
      "DELETE",
    );
    committed = {
      ...committed,
      tokens: committed.tokens.filter((old) => old.token !== token.token),
    };
    checkpoint(committed);
  }
  if (draft.newName.trim()) {
    const created = await settingsRequest<{
      token: string;
      uuid?: string;
      id?: string;
    }>(url, "POST", { name: draft.newName.trim() });
    committed = {
      ...committed,
      tokens: [
        ...committed.tokens,
        {
          ...created,
          name: draft.newName.trim(),
          ...(runner ? {} : { type: "user" as const }),
        },
      ],
      generated: [...committed.generated, created.token],
    };
  }
  return { ...committed, newName: "" };
}
export default function TokenSettings({
  runner = false,
}: {
  runner?: boolean;
}) {
  const showGeneratedTokens = useGeneratedTokens();
  const editor = useSettingsDraft(
    initial,
    runner ? loadRunners : loadClients,
    async (draft, saved, checkpoint) => {
      const result = await persist(draft, saved, checkpoint, runner);
      const generated = result.generated.slice(saved.generated.length);
      if (generated.length) showGeneratedTokens(generated);
      return result;
    },
  );
  const { draft, setDraft } = editor;
  return (
    <SettingsForm editor={editor}>
      <h2>{runner ? "Runner Tokens" : "System Access Tokens"}</h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "8px 0 16px",
        }}
      >
        {runner
          ? "Each runner authenticates with a dedicated token that binds to its first runner identity."
          : "Manage administrator and user access tokens. New tokens grant user access."}{" "}
        Tokens are created, renamed, or revoked when you select Save.
      </p>
      {runner && (
        <p
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Revoking a connected runner&apos;s token disconnects it when saved.
        </p>
      )}
      <div className={styles.tokenList}>
        {draft.tokens.length === 0 && (
          <p className={styles.empty}>
            No {runner ? "runner " : ""}tokens configured. Add one below to get
            started.
          </p>
        )}
        {draft.tokens.map((token, index) => (
          <div key={token.token} className={styles.tokenRow}>
            <div className={styles.tokenIdentity}>
              {!runner && (
                <span
                  className={styles.avatar}
                  style={{ background: token.color || "var(--accent)" }}
                  aria-hidden="true"
                >
                  {token.name.charAt(0) || "?"}
                </span>
              )}
              <span className={styles.maskedToken}>
                {token.token.slice(0, 3)}…
              </span>
              <label className={styles.tokenName}>
                <span className={styles.visuallyHidden}>
                  {runner
                    ? "Runner token name"
                    : token.type === "admin"
                      ? "Admin token name"
                      : "User token name"}
                </span>
                <input
                  type="text"
                  value={token.name}
                  title="Edit token name"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tokens: draft.tokens.map((item, i) =>
                        i === index ? { ...item, name: e.target.value } : item,
                      ),
                    })
                  }
                  className={styles.nameInput}
                />
              </label>
            </div>
            <span
              className={`${styles.tokenStatus} ${token.connected ? styles.connected : ""}`}
              title={runner ? token.runnerName : token.type}
            >
              {runner
                ? token.runnerName
                  ? `${token.connected ? "●" : "○"} ${token.runnerName}`
                  : "unused"
                : token.type === "admin"
                  ? "Admin"
                  : "User"}
            </span>
            {(runner || token.type === "user") && (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() =>
                  setDraft({
                    ...draft,
                    tokens: draft.tokens.filter(
                      (item) => item.token !== token.token,
                    ),
                  })
                }
              >
                Delete token
              </button>
            )}
          </div>
        ))}
      </div>
      <div className={styles.newToken}>
        <SettingsField
          label={runner ? "New runner token name" : "New user token name"}
        >
          <input
            type="text"
            value={draft.newName}
            placeholder={runner ? "e.g. MacBook Air" : "e.g. Team member"}
            onChange={(e) => setDraft({ ...draft, newName: e.target.value })}
            style={settingsInputStyle}
          />
        </SettingsField>
        <p className={styles.hint}>
          The token will be generated when you select Save.
        </p>
      </div>
    </SettingsForm>
  );
}
