"use client";
import styles from "@/components/admin/SettingsForm.module.css";
import SettingsForm, {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
  useSettingsDraft,
} from "@/components/admin/SettingsForm";
interface AgentCommand {
  command: string;
  menuLabel?: string;
  menuDescription?: string;
  matcher?: string;
  send: string;
}
const EMPTY_COMMAND: AgentCommand = {
  command: "",
  menuLabel: "",
  menuDescription: "",
  matcher: "",
  send: "",
};
const COMMAND_FIELDS: {
  key: keyof AgentCommand;
  label: string;
  placeholder: string;
  hint?: string;
}[] = [
  {
    key: "command",
    label: "Command *",
    placeholder: "e.g. commit message",
    hint: 'e.g. "commit message"',
  },
  {
    key: "send",
    label: "Send *",
    placeholder: "Message to send to the agent",
    hint: 'Use $1, $2, … to insert Matcher capture groups. e.g. "commit the changes with message: $1."',
  },
  {
    key: "menuLabel",
    label: "Menu Label",
    placeholder: "e.g. /commit <message>",
    hint: "e.g. /commit <message>",
  },
  {
    key: "menuDescription",
    label: "Menu Description",
    placeholder: "Short description shown in the menu",
    hint: 'e.g. "Commit the changes with a specific message"',
  },
  {
    key: "matcher",
    label: "Matcher (regex)",
    placeholder: "e.g. ^commit\\s+(.+)$",
    hint: 'Wrap capture groups in parentheses ( ) — they become $1, $2, … in Send. e.g. "^commit\\s+(.+)$ captures the message as $1"',
  },
];

const initial: AgentCommand[] = [];
const load = () =>
  settingsRequest<AgentCommand[]>("/api/agent-commands?source=custom");
async function persist(
  draft: AgentCommand[],
  saved: AgentCommand[],
  checkpoint: (value: AgentCommand[]) => void,
) {
  const commands = draft.map(
    (command) =>
      Object.fromEntries(
        Object.entries(command).map(([key, value]) => [key, value.trim()]),
      ) as unknown as AgentCommand,
  );
  if (commands.some((command) => !command.command || !command.send))
    throw new Error("Every command requires a name and an instruction.");
  if (
    new Set(commands.map((command) => command.command)).size !== commands.length
  )
    throw new Error("Command names must be unique.");
  let committed = saved;
  for (const old of saved) {
    if (commands.some((command) => command.command === old.command)) continue;
    await settingsRequest(
      "/api/agent-commands?command=" + encodeURIComponent(old.command),
      "DELETE",
    );
    committed = committed.filter((command) => command.command !== old.command);
    checkpoint(committed);
  }
  for (const command of commands) {
    if (
      JSON.stringify(command) ===
      JSON.stringify(committed.find((old) => old.command === command.command))
    )
      continue;
    await settingsRequest("/api/agent-commands", "POST", command);
    committed = [
      ...committed.filter((old) => old.command !== command.command),
      command,
    ];
    checkpoint(committed);
  }
  return commands;
}
export default function SettingsPage() {
  const editor = useSettingsDraft(initial, load, persist);
  return (
    <SettingsForm editor={editor}>
      <h2>Default Agent Commands</h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "8px 0 16px",
        }}
      >
        Default slash commands that expand into agent instructions.
      </p>
      {editor.draft.length === 0 && <p>No custom commands configured.</p>}
      {editor.draft.map((command, index) => (
        <div key={index} className={styles.card}>
          {COMMAND_FIELDS.map(({ key, label, placeholder, hint }) => (
            <SettingsField key={key} label={label}>
              {key === "send" ? (
                <textarea
                  rows={4}
                  value={command[key] ?? ""}
                  placeholder={placeholder}
                  onChange={(e) =>
                    editor.setDraft(
                      editor.draft.map((item, i) =>
                        i === index ? { ...item, [key]: e.target.value } : item,
                      ),
                    )
                  }
                  style={settingsInputStyle}
                />
              ) : (
                <input
                  type="text"
                  value={command[key] ?? ""}
                  placeholder={placeholder}
                  onChange={(e) =>
                    editor.setDraft(
                      editor.draft.map((item, i) =>
                        i === index ? { ...item, [key]: e.target.value } : item,
                      ),
                    )
                  }
                  style={settingsInputStyle}
                />
              )}
              {hint && (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {hint}
                </span>
              )}
            </SettingsField>
          ))}
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() =>
              editor.setDraft(editor.draft.filter((_, i) => i !== index))
            }
          >
            Delete command
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => editor.setDraft([...editor.draft, { ...EMPTY_COMMAND }])}
      >
        Add command
      </button>
    </SettingsForm>
  );
}
