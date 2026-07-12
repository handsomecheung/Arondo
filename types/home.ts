export type SessionStatus = "draft" | "idle" | "running" | "script-running" | "done" | "error";

export interface Session {
  id: string;
  name?: string;
  status: SessionStatus;
  prompt: string;
  agentType: string;
  repoPath: string;
  projectId: string;
  runnerId: string;
  errorMessage?: string;
  command?: string;
  createdAt: string;
  updatedAt: string;
  runningScripts?: string[];
  pinnedAt?: string;
}

export interface Project {
  id: string;
  repoPath: string;
  runnerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Runner {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  connected: boolean;
  version?: string;
  capabilities?: string[];
  agents?: string[];
  allowedUserTokenUuids?: string[];
}

export interface ProjectScript {
  name: string;
  command: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  type?: string;
  parentId?: string;
  resolvedAgentType?: string;
  prompt?: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  type: "script" | "agent";
  name: string;
  sessionId: string;
  status: "running" | "done" | "error";
  createdAt: number;
  messageId?: string;
  projectId?: string;
  scriptName?: string;
}
