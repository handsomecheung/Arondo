"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@/components/Icons";
import { agentCommandRequiresArguments, getTriggerWord } from "@/lib/agentCommands";
import type { AgentCommand } from "@/lib/agentCommands";

interface AgentCommandArgumentsModalProps {
  command: AgentCommand;
  onClose: () => void;
  onSubmit: (argumentsText: string) => void;
}

export default function AgentCommandArgumentsModal({ command, onClose, onSubmit }: AgentCommandArgumentsModalProps) {
  const [argumentsText, setArgumentsText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isRequired = agentCommandRequiresArguments(command);
  const trigger = `/${getTriggerWord(command)}`;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (isRequired && !argumentsText.trim()) return;
    onSubmit(argumentsText.trim());
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "450px" }}>
        <div className="modal-header">
          <span className="modal-title">Run {command.menuLabel ?? trigger}</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="modal-body" style={{ padding: "20px 16px" }}>
            <label className="input-label" htmlFor="agent-command-arguments">Arguments</label>
            <input
              ref={inputRef}
              id="agent-command-arguments"
              value={argumentsText}
              onChange={(event) => setArgumentsText(event.target.value)}
              placeholder="Enter command arguments"
              autoComplete="off"
              style={{ width: "100%", marginTop: 8, boxSizing: "border-box" }}
            />
          </div>
          <div className="modal-footer" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={isRequired && !argumentsText.trim()}>Run</button>
          </div>
        </form>
      </div>
    </div>
  );
}
