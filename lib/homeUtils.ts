import type { ExecCardItem } from "@/components/ExecCard";
import type { Message, Session } from "@/types/home";

// A session finished (done/error) since it was last opened, and the user
// hasn't seen the outcome yet.
export function isUnviewedCompletion(session: Session): boolean {
  if (!session.completedAt) return false;
  if (!session.lastViewedAt) return true;
  return new Date(session.completedAt).getTime() > new Date(session.lastViewedAt).getTime();
}

export function sortSessionsForSidebar(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aHasUnreadSuccess = a.status === "done" && isUnviewedCompletion(a);
    const bHasUnreadSuccess = b.status === "done" && isUnviewedCompletion(b);
    if (aHasUnreadSuccess !== bHasUnreadSuccess) return aHasUnreadSuccess ? -1 : 1;

    if (aHasUnreadSuccess && bHasUnreadSuccess) {
      const aCompleted = new Date(a.completedAt!).getTime();
      const bCompleted = new Date(b.completedAt!).getTime();
      if (aCompleted !== bCompleted) return bCompleted - aCompleted;
    }

    const aPinned = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
    const bPinned = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bUpdated - aUpdated;
  });
}

export function resolveRepoFilePath(repoPath: string, path: string): string {
  if (path.startsWith("/")) return path;
  return `${repoPath.replace(/\/$/, "")}/${path}`;
}

export function canForceSend(
  reason: { dirty: boolean; busy: boolean; queued?: boolean },
  isFollowup = false,
): boolean {
  return !isFollowup || !reason.busy;
}

export interface ConfirmationButton {
  choice: "pendingAuto" | "draft" | "force";
  label: string;
}

// Single source of truth for the "Project not ready" dialog's button set, so
// ProjectNotReadyModal and its tests can't drift out of sync.
export function getConfirmationButtons(
  reason: { dirty: boolean; busy: boolean; queued?: boolean },
  isFollowup?: boolean
): ConfirmationButton[] {
  const buttons: ConfirmationButton[] = [
    {
      choice: "pendingAuto",
      label: isFollowup ? "Send automatically once earlier messages are handled" : "Send automatically once ready",
    },
    { choice: "draft", label: "Save as draft, send manually later" },
  ];
  if (canForceSend(reason, isFollowup)) {
    buttons.push({ choice: "force", label: "Send now anyway" });
  }
  return buttons;
}

export function autoResizeTextarea(el: HTMLTextAreaElement, maxHeight = 260) {
  const text = el.value || el.placeholder;
  const original = el.value;
  if (text !== original) el.value = text;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  if (text !== original) el.value = original;
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function readUrlState(): { session: string | null; project: string | null } {
  if (typeof window === "undefined") return { session: null, project: null };
  const m = window.location.pathname.match(/^\/(session|project)\/(.+)$/);
  if (!m) return { session: null, project: null };
  return {
    session: m[1] === "session" ? m[2] : null,
    project: m[1] === "project" ? m[2] : null,
  };
}

export function agentTypeLabel(type: string): string {
  if (type === "antigravity") return "Antigravity CLI";
  if (type === "claude") return "Claude Code";
  if (type === "codex") return "Codex";
  if (type === "opencode") return "OpenCode";
  if (type === "auto") return "Auto";
  return type;
}

export function parseExecCommand(content: string): { label: string; command: string } {
  const scriptMatch = content.match(/Running script:\s*\*\*([^*]+)\*\*/);
  if (scriptMatch) {
    const cmdMatch = content.match(/```bash\n([\s\S]*?)```/);
    return {
      label: scriptMatch[1].trim(),
      command: cmdMatch ? cmdMatch[1].trim() : "",
    };
  }
  const cmdMatch = content.match(/```bash\n([\s\S]*?)```/);
  const cmd = cmdMatch ? cmdMatch[1].trim() : "";
  const shortCmd = cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  return { label: shortCmd || "Executing command", command: cmd };
}

export interface ExecCardInfo {
  runMsg: Message;
  returnMsg: Message | null;
  isScript: boolean;
  commandLabel: string;
  command: string;
  agentType?: string;
  prompt?: string;
  isQuickCard?: boolean;
}

export function execCardInfoToItem(info: ExecCardInfo): ExecCardItem {
  const isDone = info.returnMsg !== null;
  const isSuccess = isDone && info.returnMsg!.content.startsWith("✅");
  const isStopped = isDone && info.returnMsg!.content.startsWith("🛑");
  let statusText: string;
  if (!isDone) {
    statusText = info.isScript && info.runMsg.waitingForInput ? "Waiting for input" : "Running...";
  } else if (isSuccess) {
    statusText = "Completed";
  } else if (isStopped) {
    statusText = "Stopped by user";
  } else {
    statusText = info.returnMsg!.content.replace(/^❌\s*/, "").replace(/^Error:\s*/, "");
  }
  return {
    id: info.runMsg.id,
    type: info.isScript ? "script" : "agent",
    agentType: info.agentType,
    title: !info.isScript && info.agentType ? agentTypeLabel(info.agentType) : info.commandLabel,
    subtitle: info.runMsg.detachedKind
      ? info.runMsg.detachedKind === "review" ? "Review · separate context" : "By the way · separate context"
      : undefined,
    status: !isDone ? "running" : isStopped ? "stopped" : isSuccess ? "done" : "error",
    statusText,
    command: info.command || undefined,
    messageId: info.runMsg.id,
    timestamp: formatTime(info.runMsg.createdAt),
    waitingForInput: !isDone && info.isScript && !!info.runMsg.waitingForInput,
  };
}

export function splitPathForMiddleTruncate(fullPath: string): { prefix: string; suffix: string } {
  if (!fullPath) return { prefix: "", suffix: "" };
  const sep = fullPath.includes("\\") ? "\\" : "/";
  const normalized = fullPath.endsWith(sep) && fullPath.length > 1 ? fullPath.slice(0, -1) : fullPath;
  const segments = normalized.split(sep).filter(Boolean);
  if (segments.length <= 1) {
    const mid = Math.ceil(fullPath.length / 2);
    return { prefix: fullPath.slice(0, mid), suffix: fullPath.slice(mid) };
  }
  if (segments.length === 2) {
    const prefix = (fullPath.startsWith(sep) ? sep : "") + segments[0];
    const suffix = sep + segments[1] + (fullPath.endsWith(sep) && fullPath.length > 1 ? sep : "");
    return { prefix, suffix };
  }
  const prefix = (fullPath.startsWith(sep) ? sep : "") + segments.slice(0, -2).join(sep);
  const suffix = sep + segments.slice(-2).join(sep) + (fullPath.endsWith(sep) && fullPath.length > 1 ? sep : "");
  return { prefix, suffix };
}
