import type { ExecCardItem } from "@/components/ExecCard";
import type { Message } from "@/types/home";

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
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
}

export function execCardInfoToItem(info: ExecCardInfo): ExecCardItem {
  const isDone = info.returnMsg !== null;
  const isSuccess = isDone && info.returnMsg!.content.startsWith("✅");
  const isStopped = isDone && info.returnMsg!.content.startsWith("🛑");
  let statusText: string;
  if (!isDone) {
    statusText = "Running...";
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
    title: !info.isScript && info.agentType ? agentTypeLabel(info.agentType) : info.commandLabel,
    status: !isDone ? "running" : isStopped ? "stopped" : isSuccess ? "done" : "error",
    statusText,
    command: info.command || undefined,
    messageId: info.runMsg.id,
    timestamp: formatTime(info.runMsg.createdAt),
  };
}
