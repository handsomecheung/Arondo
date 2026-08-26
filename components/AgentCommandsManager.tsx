"use client";

import { useState } from "react";
import type { AgentCommand } from "@/lib/agentCommands";

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
    hint: 'Use $1, $2, ... to insert Matcher capture groups. e.g. "commit the changes with message: $1."',
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
    hint: 'Wrap capture groups in parentheses ( ) - they become $1, $2, ... in Send. e.g. "^commit\\s+(.+)$ captures the message as $1"',
  },
];

interface AgentCommandsManagerProps {
  title: string;
  description: string;
  commands: AgentCommand[];
  canEdit: boolean;
  onSave: (command: AgentCommand) => Promise<void>;
  onDelete: (command: string) => Promise<void>;
  onRequestDeleteConfirm?: (command: string, onConfirm: () => Promise<void>) => void;
}

function buildCommandBody(draft: AgentCommand): AgentCommand {
  const body: AgentCommand = {
    command: draft.command.trim(),
    send: draft.send.trim(),
  };
  if (draft.menuLabel?.trim()) body.menuLabel = draft.menuLabel.trim();
  if (draft.menuDescription?.trim()) {
    body.menuDescription = draft.menuDescription.trim();
  }
  if (draft.matcher?.trim()) body.matcher = draft.matcher.trim();
  return body;
}

export default function AgentCommandsManager({
  title,
  description,
  commands,
  canEdit,
  onSave,
  onDelete,
  onRequestDeleteConfirm,
}: AgentCommandsManagerProps) {
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [newCommand, setNewCommand] = useState<AgentCommand>(EMPTY_COMMAND);
  const [savingCommand, setSavingCommand] = useState(false);
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AgentCommand>(EMPTY_COMMAND);

  const handleAddCommand = async () => {
    if (!newCommand.command.trim() || !newCommand.send.trim()) return;
    setSavingCommand(true);
    try {
      await onSave(buildCommandBody(newCommand));
      setNewCommand(EMPTY_COMMAND);
      setShowAddCommand(false);
    } finally {
      setSavingCommand(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editDraft.command.trim() || !editDraft.send.trim()) return;
    setSavingCommand(true);
    try {
      await onSave(buildCommandBody(editDraft));
      setEditingCommand(null);
    } finally {
      setSavingCommand(false);
    }
  };

  const requestDelete = (command: string) => {
    const runDelete = async () => {
      await onDelete(command);
    };
    if (onRequestDeleteConfirm) {
      onRequestDeleteConfirm(command, runDelete);
      return;
    }
    runDelete();
  };

  return (
    <div className="agent-commands-manager">
      <div
        className="agent-commands-manager-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div className="agent-commands-manager-copy">
          <h2
            className="agent-commands-manager-title"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {description}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setShowAddCommand(true);
              setNewCommand(EMPTY_COMMAND);
            }}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--accent)",
              background: "var(--accent-glow)",
              border: "1px solid var(--border-accent)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            + Add
          </button>
        )}
      </div>

      {showAddCommand && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-accent)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 2,
            }}
          >
            New Command
          </h3>
          {COMMAND_FIELDS.map(({ key, label, placeholder, hint }) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                {label}
              </label>
              <input
                value={(newCommand[key] as string) ?? ""}
                onChange={(e) =>
                  setNewCommand((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                placeholder={placeholder}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontFamily: key === "matcher" || key === "send" ? "monospace" : "inherit",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              {hint && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={handleAddCommand}
              disabled={savingCommand || !newCommand.command.trim() || !newCommand.send.trim()}
              style={{
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                opacity: savingCommand || !newCommand.command.trim() || !newCommand.send.trim() ? 0.5 : 1,
              }}
            >
              {savingCommand ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setShowAddCommand(false)}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commands.length === 0 && !showAddCommand && (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No custom commands. Click &quot;+ Add&quot; to create one.
          </div>
        )}
        {commands.map((cmd) =>
          editingCommand === cmd.command ? (
            <div
              key={cmd.command}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-accent)",
                borderRadius: "var(--radius-md)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 2,
                }}
              >
                Edit Command
              </h3>
              {COMMAND_FIELDS.map(({ key, label, placeholder, hint }) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                    {label}
                  </label>
                  <input
                    value={(editDraft[key] as string) ?? ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "7px 10px",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      fontFamily: key === "matcher" || key === "send" ? "monospace" : "inherit",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  {hint && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingCommand || !editDraft.command.trim() || !editDraft.send.trim()}
                  style={{
                    padding: "7px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    opacity: savingCommand || !editDraft.command.trim() || !editDraft.send.trim() ? 0.5 : 1,
                  }}
                >
                  {savingCommand ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingCommand(null)}
                  style={{
                    padding: "7px 14px",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={cmd.command}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                padding: 14,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <code
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "var(--accent-glow)",
                      border: "1px solid var(--border-accent)",
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}
                  >
                    /{cmd.command}
                  </code>
                  {cmd.menuDescription && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {cmd.menuDescription}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cmd.send}
                >
                  {cmd.send}
                </div>
                {cmd.matcher && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      marginTop: 2,
                    }}
                  >
                    matcher: {cmd.matcher}
                  </div>
                )}
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setEditingCommand(cmd.command);
                      setEditDraft({ ...cmd });
                    }}
                    title="Edit command"
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => requestDelete(cmd.command)}
                    title="Delete command"
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      color: "var(--error, #e74c3c)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
