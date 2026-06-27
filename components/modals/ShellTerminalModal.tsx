import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { IconX, IconTerminal } from "@/components/Icons";

const ShellTerminal = dynamic(() => import("@/components/ShellTerminal"), { ssr: false });

interface Props {
  open: boolean;
  onClose: () => void;
  repoPath?: string;
  runnerId?: string;
  sessionId?: string | null;
  ws: WebSocket | null;
}

export default function ShellTerminalModal({ open, onClose, repoPath, runnerId, sessionId, ws }: Props) {
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
    }
  }, [open]);

  if (!hasOpened) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ display: open ? "flex" : "none" }}
    >
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconTerminal />
            Terminal
            {repoPath && (
              <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 4 }}>{repoPath}</span>
            )}
          </span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close terminal">
            <IconX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0, overflow: "hidden" }}>
          <ShellTerminal ws={ws} cwd={repoPath} runnerId={runnerId} sessionId={sessionId ?? undefined} />
        </div>
      </div>
    </div>
  );
}
