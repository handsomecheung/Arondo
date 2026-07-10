import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "./config";
import { withFileLock, writeJsonAtomic } from "./fileLock";

const CONFIG_DIR = getConfigDir();
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");
const SCHEDULED_TASKS_FILE = path.join(CONFIG_DIR, "scheduled-tasks.json");

export type SessionStatus = "draft" | "idle" | "running" | "script-running" | "done" | "error";

export interface Project {
  id: string;
  repoPath: string;
  runnerId: string;
  createdAt: string;
  updatedAt: string;
}

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
}

export type MessageType =
  | "chat-user"
  | "chat-system-defined"
  | "agent-run"
  | "agent-return"
  | "script-run"
  | "script-return"
  | "system-info"
  | "system-error";

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  type?: MessageType;
  parentId?: string;
  createdAt: string;
  pid?: number;
  runnerId?: string;
  exitCode?: number;
  command?: string;
  projectId?: string;
  stoppedByUser?: boolean;
  taskId?: string;
  resolvedAgentType?: string;
  prompt?: string;
  tokenUuid?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionDir(id: string): string {
  return path.join(SESSIONS_DIR, id);
}

function getSessionFilePath(id: string): string {
  return path.join(getSessionDir(id), "session.json");
}

function getMessagesFilePath(id: string, projectId?: string): string {
  if (!id && projectId) {
    return path.join(getProjectDir(projectId), "messages.json");
  }
  return path.join(getSessionDir(id), "messages.json");
}

function getProjectDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}

function getProjectFilePath(id: string): string {
  return path.join(getProjectDir(id), "project.json");
}

function getProjectSettingsDir(id: string): string {
  return path.join(getProjectDir(id), "settings");
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as any).code !== 'ENOENT') {
      console.error(`[readJson error] path=${filePath}:`, err);
    }
    return defaultValue;
  }
}

async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeJsonAtomic(filePath, data);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  try {
    await ensureDir(SESSIONS_DIR);
    const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const sessions: Session[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = getSessionFilePath(entry.name);
        try {
          const session = await readJson<Session | null>(filePath, null);
          if (session) {
            sessions.push(session);
          }
        } catch {
          // Ignore corrupt metadata
        }
      }
    }
    
    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session | undefined> {
  const filePath = getSessionFilePath(id);
  const session = await readJson<Session | null>(filePath, null);
  return session || undefined;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectScript {
  name: string;
  command: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getOrCreateProject(repoPath: string, runnerId: string): Promise<Project> {
  await ensureDir(PROJECTS_DIR);

  const resolvedRepoPath = path.resolve(repoPath);

  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = getProjectFilePath(entry.name);
        try {
          const project = await readJson<Project | null>(filePath, null);
          if (project && path.resolve(project.repoPath) === resolvedRepoPath && project.runnerId === runnerId) {
            return project;
          }
        } catch {
          // Ignore corrupt project config
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  const projectId = crypto.randomUUID();
  const project: Project = {
    id: projectId,
    repoPath: resolvedRepoPath,
    runnerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeJson(getProjectFilePath(projectId), project);
  return project;
}

export async function getProjects(): Promise<Project[]> {
  try {
    await ensureDir(PROJECTS_DIR);
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: Project[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = getProjectFilePath(entry.name);
        try {
          const project = await readJson<Project | null>(filePath, null);
          if (project) {
            projects.push(project);
          }
        } catch {
          // Ignore corrupt project config
        }
      }
    }
    
    return projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  const filePath = getProjectFilePath(id);
  const project = await readJson<Project | null>(filePath, null);
  return project || undefined;
}

export async function getProjectScripts(projectId: string): Promise<ProjectScript[]> {
  const settingsDir = getProjectSettingsDir(projectId);
  const filePath = path.join(settingsDir, "scripts.json");
  return readJson<ProjectScript[]>(filePath, []);
}

export async function addProjectScript(
  projectId: string,
  script: ProjectScript,
  oldName?: string
): Promise<ProjectScript[]> {
  const settingsDir = getProjectSettingsDir(projectId);
  await ensureDir(settingsDir);
  const filePath = path.join(settingsDir, "scripts.json");
  return withFileLock(filePath, async () => {
    let scripts = await readJson<ProjectScript[]>(filePath, []);

    if (oldName && oldName !== script.name) {
      scripts = scripts.filter((s) => s.name !== oldName);
    }

    const index = scripts.findIndex((s) => s.name === script.name);
    if (index >= 0) {
      scripts[index] = script;
    } else {
      scripts.push(script);
    }

    await writeJson(filePath, scripts);
    return scripts;
  });
}

export async function deleteProjectScript(projectId: string, scriptName: string): Promise<ProjectScript[]> {
  const settingsDir = getProjectSettingsDir(projectId);
  const filePath = path.join(settingsDir, "scripts.json");
  return withFileLock(filePath, async () => {
    const scripts = await readJson<ProjectScript[]>(filePath, []);
    const filtered = scripts.filter((s) => s.name !== scriptName);
    await writeJson(filePath, filtered);
    return filtered;
  });
}

export async function saveProjectScripts(
  projectId: string,
  scripts: ProjectScript[]
): Promise<ProjectScript[]> {
  const settingsDir = getProjectSettingsDir(projectId);
  await ensureDir(settingsDir);
  const filePath = path.join(settingsDir, "scripts.json");
  return withFileLock(filePath, async () => {
    await writeJson(filePath, scripts);
    return scripts;
  });
}


export async function createSession(
  data: Omit<Session, "id" | "projectId" | "createdAt" | "updatedAt">
): Promise<Session> {
  const id = crypto.randomUUID();
  const project = await getOrCreateProject(data.repoPath, data.runnerId);
  const session: Session = {
    ...data,
    id,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeJson(getSessionFilePath(id), session);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<Session, "id" | "createdAt">>
): Promise<Session | undefined> {
  const filePath = getSessionFilePath(id);
  return withFileLock(filePath, async () => {
    const session = await readJson<Session | null>(filePath, null);
    if (!session) return undefined;

    const updated: Session = {
      ...session,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await writeJson(filePath, updated);
    return updated;
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(sessionId: string, projectId?: string): Promise<Message[]> {
  return readJson<Message[]>(getMessagesFilePath(sessionId, projectId), []);
}

export async function addMessage(
  data: Omit<Message, "id" | "createdAt">
): Promise<Message> {
  const { sessionId, projectId } = data;
  const filePath = getMessagesFilePath(sessionId, projectId);
  return withFileLock(filePath, async () => {
    const all = await readJson<Message[]>(filePath, []);
    const message: Message = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    all.push(message);
    await writeJson(filePath, all);
    return message;
  });
}

export async function updateMessage(
  sessionId: string,
  messageId: string,
  patch: Partial<Omit<Message, "id" | "createdAt">>,
  projectId?: string
): Promise<Message | undefined> {
  const filePath = getMessagesFilePath(sessionId, projectId);
  return withFileLock(filePath, async () => {
    const all = await readJson<Message[]>(filePath, []);
    const index = all.findIndex((m) => m.id === messageId);
    if (index === -1) return undefined;

    const updated: Message = {
      ...all[index],
      ...patch,
    };
    all[index] = updated;
    await writeJson(filePath, all);
    return updated;
  });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function getLogFilePath(sessionId: string, messageId: string, projectId?: string): string {
  if (!sessionId) {
    if (!projectId) {
      throw new Error("getLogFilePath: projectId is required for project-scoped (sessionless) logs");
    }
    return path.join(getProjectDir(projectId), "logs", `${messageId}.log`);
  }
  return path.join(getSessionDir(sessionId), "logs", `${messageId}.log`);
}

export async function clearSessionLog(sessionId: string, messageId: string, projectId?: string): Promise<void> {
  const logPath = getLogFilePath(sessionId, messageId, projectId);
  await ensureDir(path.dirname(logPath));
  await fs.writeFile(logPath, "", "utf-8");
}

export async function appendSessionLog(sessionId: string, messageId: string, text: string, raw = false, projectId?: string): Promise<void> {
  const logPath = getLogFilePath(sessionId, messageId, projectId);
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, raw ? text : text + "\n", "utf-8");
}

export async function getSessionLog(sessionId: string, messageId: string, projectId?: string): Promise<string> {
  try {
    return await fs.readFile(getLogFilePath(sessionId, messageId, projectId), "utf-8");
  } catch {
    return "";
  }
}

function getHtmlFilePath(sessionId: string, messageId: string, projectId?: string): string {
  if (!sessionId) {
    if (!projectId) {
      throw new Error("getHtmlFilePath: projectId is required for project-scoped (sessionless) logs");
    }
    return path.join(getProjectDir(projectId), "logs", `${messageId}.html`);
  }
  return path.join(getSessionDir(sessionId), "logs", `${messageId}.html`);
}

export async function saveSessionHtml(sessionId: string, messageId: string, html: string, projectId?: string): Promise<void> {
  const htmlPath = getHtmlFilePath(sessionId, messageId, projectId);
  await ensureDir(path.dirname(htmlPath));
  await fs.writeFile(htmlPath, html, "utf-8");
}

export async function getSessionHtml(sessionId: string, messageId: string, projectId?: string): Promise<string> {
  try {
    return await fs.readFile(getHtmlFilePath(sessionId, messageId, projectId), "utf-8");
  } catch {
    return "";
  }
}

function getDiffsFilePath(sessionId: string, messageId: string, projectId?: string): string {
  if (!sessionId) {
    if (!projectId) {
      throw new Error("getDiffsFilePath: projectId is required for project-scoped (sessionless) logs");
    }
    return path.join(getProjectDir(projectId), "logs", `${messageId}_diffs.json`);
  }
  return path.join(getSessionDir(sessionId), "logs", `${messageId}_diffs.json`);
}

export async function saveSessionDiffs(sessionId: string, messageId: string, diffs: Record<string, string>, projectId?: string): Promise<void> {
  const diffsPath = getDiffsFilePath(sessionId, messageId, projectId);
  await ensureDir(path.dirname(diffsPath));
  await fs.writeFile(diffsPath, JSON.stringify(diffs, null, 2), "utf-8");
}

export async function getSessionDiffs(sessionId: string, messageId: string, projectId?: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(getDiffsFilePath(sessionId, messageId, projectId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Scheduled Tasks ────────────────────────────────────────────────────────

export type ScheduledTaskStatus = "pending" | "triggered" | "done" | "failed" | "cancelled" | "expired";

export type ScheduledTaskTrigger =
  | { kind: "at"; timestamp: number }
  | { kind: "afterSession"; sessionId: string }
  | { kind: "quotaAvailable"; agentType?: string }
  | { kind: "codebaseReady"; runnerId: string; repoPath: string };

export type ScheduledTaskAction =
  | { kind: "sendMessage"; sessionId: string; message: string; prompt?: string };

export interface ScheduledTask {
  id: string;
  createdAt: number;
  status: ScheduledTaskStatus;
  trigger: ScheduledTaskTrigger;
  action: ScheduledTaskAction;
  label?: string;
  tokenUuid?: string;
  lastError?: string;
  resultMessageId?: string;
}

async function getScheduledTasksRaw(): Promise<ScheduledTask[]> {
  return readJson<ScheduledTask[]>(SCHEDULED_TASKS_FILE, []);
}

async function writeScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
  await writeJson(SCHEDULED_TASKS_FILE, tasks);
}

export async function getScheduledTasks(): Promise<ScheduledTask[]> {
  const tasks = await getScheduledTasksRaw();
  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getScheduledTask(id: string): Promise<ScheduledTask | undefined> {
  const tasks = await getScheduledTasksRaw();
  return tasks.find((t) => t.id === id);
}

export async function addScheduledTask(
  data: Omit<ScheduledTask, "id" | "createdAt" | "status">
): Promise<ScheduledTask> {
  return withFileLock(SCHEDULED_TASKS_FILE, async () => {
    const tasks = await getScheduledTasksRaw();
    const task: ScheduledTask = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: "pending",
    };
    tasks.push(task);
    await writeScheduledTasks(tasks);
    return task;
  });
}

export async function updateScheduledTask(
  id: string,
  patch: Partial<Omit<ScheduledTask, "id" | "createdAt">>
): Promise<ScheduledTask | undefined> {
  return withFileLock(SCHEDULED_TASKS_FILE, async () => {
    const tasks = await getScheduledTasksRaw();
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return undefined;
    const updated: ScheduledTask = { ...tasks[index], ...patch };
    tasks[index] = updated;
    await writeScheduledTasks(tasks);
    return updated;
  });
}

export async function removeScheduledTasksForSession(sessionId: string): Promise<void> {
  return withFileLock(SCHEDULED_TASKS_FILE, async () => {
    const tasks = await getScheduledTasksRaw();
    const filtered = tasks.filter((t) => {
      if (t.trigger.kind === "afterSession" && t.trigger.sessionId === sessionId) return false;
      if (t.action.kind === "sendMessage" && t.action.sessionId === sessionId) return false;
      return true;
    });
    if (filtered.length !== tasks.length) {
      await writeScheduledTasks(filtered);
    }
  });
}

export async function deleteSession(id: string): Promise<void> {
  const sessionDir = getSessionDir(id);
  await fs.rm(sessionDir, { recursive: true, force: true });
}

export async function deleteProject(id: string): Promise<void> {
  const projectDir = getProjectDir(id);
  await fs.rm(projectDir, { recursive: true, force: true });
}


