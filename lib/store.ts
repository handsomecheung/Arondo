import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getConfigDir } from "./config";
import { withFileLock, writeJsonAtomic } from "./fileLock";

const CONFIG_DIR = getConfigDir();
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const ARCHIVED_SESSIONS_DIR = path.join(CONFIG_DIR, "archived", "sessions");
const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");
const ARONDO_CONFIG_FILE = path.join(CONFIG_DIR, "arondo.json");

const DEFAULT_SESSION_ARCHIVE_DAYS = 7;
const SESSION_ARCHIVE_DAYS_DEFAULT =
  Number(process.env.ARONDO_SESSION_ARCHIVE_DAYS_DEFAULT) || DEFAULT_SESSION_ARCHIVE_DAYS;

const FILE_SHOW_HIDDEN_DEFAULT = process.env.ARONDO_FILE_SHOW_HIDDEN_DEFAULT !== "false";

export interface AppSettings {
  sessionArchiveDays?: number;
  showHiddenFiles?: boolean;
  showTempDirSessions?: boolean;
  enableAutomodel?: boolean;
  llmApiKeys?: {
    ANTHROPIC_API_KEY?: string;
    OPENAI_API_KEY?: string;
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
  };
}

interface ArondoConfigWithSettings {
  setitngs?: AppSettings;
  [key: string]: unknown;
}

export type SessionStatus = "idle" | "running" | "script-running" | "done" | "error";

export type TodoTriggerKind = "manual" | "codebaseReady" | "afterSession" | "quotaAvailable" | "at";

export interface TodoTrigger {
  kind: TodoTriggerKind;
  timestamp?: number; // "at" only
  agentType?: string; // "quotaAvailable" only
  agyQuotaGroup?: "gemini" | "other"; // agy "quotaAvailable" only
}

export interface Project {
  id: string;
  repoPath: string;
  runnerId: string;
  createdAt: string;
  updatedAt: string;
  // Set when the project's repoPath was generated via the session-creation
  // "tempDir" option. Kept out of normal project/session/task lists.
  tempDir?: boolean;
}

export interface Session {
  id: string;
  name?: string;
  status: SessionStatus;
  agentType: string;
  repoPath: string;
  projectId: string;
  runnerId: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  runningScripts?: string[];
  // Set to true on manual archive, false on manual unarchive. Undefined
  // means never manually touched — the only state auto-archive may act on.
  archivedManually?: boolean;
  // ISO timestamp of when the session was pinned. Pinned sessions sort first,
  // ordered by this value; undefined/absent means not pinned.
  pinnedAt?: string;
  // ISO timestamp of the last time the user opened this session in the UI.
  // Compared against completedAt to decide whether to show the "unread
  // completion" indicator in the sidebar.
  lastViewedAt?: string;
  // ISO timestamp of the most recent transition to status "done"/"error".
  // Set automatically by updateSession(), never bumped by unrelated patches.
  completedAt?: string;
  // Ids of this session's messages currently todoStatus:"pending". Pure
  // cache/index — the message itself is the source of truth. Maintained by
  // addTodoMessage()/resolveTodoMessage()/changeTodoTrigger().
  pendingTodoMessageIds?: string[];
  // Denormalized kind of the (first) pending todo, so the sidebar/composer
  // can label Draft/Pending without reading messages.json.
  pendingTodoTrigger?: TodoTriggerKind;
  // Most recent concrete agent/model selected when agentType is "auto".
  autoLockedAgentType?: string;
  autoLockedAgentModel?: string;
  autoLockedAgentEffort?: string;
  autoLockedAgyQuotaGroup?: "gemini" | "other";
  tokenUuid?: string;
}

export type MessageType =
  | "chat-user"
  | "chat-system-defined"
  | "agent-run"
  | "agent-return"
  | "script-run"
  | "script-return"
  | "system-info"
  | "system-error"
  | "user-todo"
  | "detached-agent-run"
  | "detached-agent-return";

export type DetachedAgentKind = "review" | "btw";

export type TodoStatus = "pending" | "triggered" | "done" | "failed" | "cancelled" | "expired";

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
  taskDeleted?: boolean;
  resolvedAgentType?: string;
  resolvedAgyQuotaGroup?: "gemini" | "other";
  prompt?: string;
  tokenUuid?: string;
  userName?: string;
  userColor?: string;
  // Detached agent runs use a fresh agent conversation and never participate
  // in the parent session's normal conversation history.
  detachedKind?: DetachedAgentKind;
  agentSessionKey?: string;
  // "user-todo" messages only:
  todoStatus?: TodoStatus;
  todoTrigger?: TodoTrigger;
  todoResultMessageId?: string;
  todoError?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionDir(id: string): string {
  const activeDir = path.join(SESSIONS_DIR, id);
  if (!fsSync.existsSync(activeDir) && fsSync.existsSync(path.join(ARCHIVED_SESSIONS_DIR, id))) {
    return path.join(ARCHIVED_SESSIONS_DIR, id);
  }
  return activeDir;
}

export function isSessionArchived(id: string): boolean {
  return fsSync.existsSync(path.join(ARCHIVED_SESSIONS_DIR, id));
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
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
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

export async function getArchivedSessions(): Promise<Session[]> {
  try {
    await ensureDir(ARCHIVED_SESSIONS_DIR);
    const entries = await fs.readdir(ARCHIVED_SESSIONS_DIR, { withFileTypes: true });
    const sessions: Session[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = path.join(ARCHIVED_SESSIONS_DIR, entry.name, "session.json");
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

    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export async function getArchivedSessionPaths(): Promise<string[]> {
  try {
    await ensureDir(ARCHIVED_SESSIONS_DIR);
    const entries = await fs.readdir(ARCHIVED_SESSIONS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(ARCHIVED_SESSIONS_DIR, entry.name, "session.json"));
  } catch {
    return [];
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectScript {
  name: string;
  command: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export function isTempDirProject(project: Pick<Project, "tempDir">): boolean {
  return project.tempDir === true;
}

export async function getOrCreateProject(repoPath: string, runnerId: string, opts: { tempDir?: boolean } = {}): Promise<Project> {
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
    ...(opts.tempDir ? { tempDir: true } : {}),
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

function getScriptHistoryFilePath(projectId: string): string {
  return path.join(getProjectDir(projectId), "script-history.json");
}

export async function getScriptHistory(projectId: string): Promise<Record<string, number>> {
  return readJson<Record<string, number>>(getScriptHistoryFilePath(projectId), {});
}

export async function recordScriptHistory(projectId: string, command: string): Promise<void> {
  const filePath = getScriptHistoryFilePath(projectId);
  await withFileLock(filePath, async () => {
    const history = await readJson<Record<string, number>>(filePath, {});
    history[command] = (history[command] || 0) + 1;
    await writeJson(filePath, history);
  });
}

export async function createSession(
  data: Omit<Session, "id" | "projectId" | "createdAt" | "updatedAt">,
  opts: { tempDir?: boolean } = {}
): Promise<Session> {
  const id = crypto.randomUUID();
  const project = await getOrCreateProject(data.repoPath, data.runnerId, { tempDir: opts.tempDir });
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
    if (patch.status === "done" || patch.status === "error") {
      updated.completedAt = updated.updatedAt;
    }

    await writeJson(filePath, updated);
    return updated;
  });
}

// Records that the user opened this session in the UI. Deliberately bypasses
// updateSession() so it never bumps updatedAt (which would reorder the
// sidebar's most-recently-active sort merely from viewing a session).
export async function touchSessionViewed(id: string): Promise<Session | undefined> {
  const filePath = getSessionFilePath(id);
  return withFileLock(filePath, async () => {
    const session = await readJson<Session | null>(filePath, null);
    if (!session) return undefined;

    const updated: Session = { ...session, lastViewedAt: new Date().toISOString() };
    await writeJson(filePath, updated);
    return updated;
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(sessionId: string, projectId?: string): Promise<Message[]> {
  return readJson<Message[]>(getMessagesFilePath(sessionId, projectId), []);
}

export async function addMessage(
  data: Omit<Message, "id" | "createdAt"> & { id?: string }
): Promise<Message> {
  const { sessionId, projectId } = data;
  const filePath = getMessagesFilePath(sessionId, projectId);
  return withFileLock(filePath, async () => {
    const all = await readJson<Message[]>(filePath, []);
    const message: Message = {
      ...data,
      id: data.id ?? crypto.randomUUID(),
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

export type LogStream = "stdout" | "stderr";

function getLogFilePath(sessionId: string, messageId: string, projectId?: string, stream?: LogStream): string {
  const suffix = stream === "stderr" ? ".stderr" : "";
  if (!sessionId) {
    if (!projectId) {
      throw new Error("getLogFilePath: projectId is required for project-scoped (sessionless) logs");
    }
    return path.join(getProjectDir(projectId), "logs", `${messageId}${suffix}.log`);
  }
  return path.join(getSessionDir(sessionId), "logs", `${messageId}${suffix}.log`);
}

function getAutomodelLogFilePath(sessionId: string, messageId: string): string {
  return path.join(getSessionDir(sessionId), "logs", `${messageId}.automodel.log`);
}

export async function clearSessionLog(sessionId: string, messageId: string, projectId?: string): Promise<void> {
  const paths = [
    getLogFilePath(sessionId, messageId, projectId),
    getLogFilePath(sessionId, messageId, projectId, "stderr"),
  ];
  await ensureDir(path.dirname(paths[0]));
  await Promise.all(paths.map((logPath) => fs.writeFile(logPath, "", "utf-8")));
}

export async function appendSessionLog(sessionId: string, messageId: string, text: string, raw = false, projectId?: string, stream?: LogStream): Promise<void> {
  const logPath = getLogFilePath(sessionId, messageId, projectId, stream);
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, raw ? text : text + "\n", "utf-8");
}

export async function appendAutomodelLog(sessionId: string, messageId: string, text: string): Promise<void> {
  const logPath = getAutomodelLogFilePath(sessionId, messageId);
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, text.endsWith("\n") ? text : `${text}\n`, "utf-8");
}

export async function getSessionLog(sessionId: string, messageId: string, projectId?: string, stream: LogStream = "stdout"): Promise<string> {
  try {
    return await fs.readFile(getLogFilePath(sessionId, messageId, projectId, stream), "utf-8");
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

// ─── Todo Messages ──────────────────────────────────────────────────────────
//
// A "todo" message is a chat message that hasn't been dispatched yet — it
// carries a trigger describing when it should fire. This replaces the old
// global scheduled-tasks.json: draft/pending sessions, quota-exhausted
// auto-retry, and follow-ups queued behind a running agent are all just
// "user-todo" messages with a different `todoTrigger.kind`.
//
// `Session.pendingTodoMessageIds`/`pendingTodoTrigger` are a pure cache/index
// over this — always kept in sync here so callers never touch them directly.

async function syncPendingTodoPointer(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const messages = await getMessages(sessionId);
  const pending = messages.filter((m) => m.type === "user-todo" && m.todoStatus === "pending");
  await updateSession(sessionId, {
    pendingTodoMessageIds: pending.map((m) => m.id),
    pendingTodoTrigger: pending[0]?.todoTrigger?.kind,
  });
}

export async function addTodoMessage(
  sessionId: string,
  data: { content: string; prompt?: string; trigger: TodoTrigger; tokenUuid?: string }
): Promise<Message> {
  let userName: string | undefined;
  let userColor: string | undefined;
  if (data.tokenUuid) {
    try {
      const { readTokensConfig } = await import("./auth");
      const authConfig = await readTokensConfig();
      const client = authConfig.clients.find(c => c.uuid === data.tokenUuid);
      if (client) {
        userName = client.name;
        userColor = client.color;
      }
    } catch (err) {
      console.error("Failed to resolve user color/name for todo message:", err);
    }
  }

  const message = await addMessage({
    sessionId,
    role: "user",
    content: data.content,
    prompt: data.prompt,
    type: "user-todo",
    todoStatus: "pending",
    todoTrigger: data.trigger,
    tokenUuid: data.tokenUuid,
    userName,
    userColor,
  });
  await syncPendingTodoPointer(sessionId);
  return message;
}

export async function resolveTodoMessage(
  sessionId: string,
  messageId: string,
  patch: { todoStatus: TodoStatus; todoResultMessageId?: string; todoError?: string }
): Promise<Message | undefined> {
  const updated = await updateMessage(sessionId, messageId, patch);
  if (updated) await syncPendingTodoPointer(sessionId);
  return updated;
}

export async function changeTodoTrigger(
  sessionId: string,
  messageId: string,
  trigger: TodoTrigger
): Promise<Message | undefined> {
  const updated = await updateMessage(sessionId, messageId, { todoTrigger: trigger });
  if (updated) await syncPendingTodoPointer(sessionId);
  return updated;
}

export async function getPendingTodoMessages(sessionId: string): Promise<Message[]> {
  const messages = await getMessages(sessionId);
  return messages.filter((m) => m.type === "user-todo" && m.todoStatus === "pending");
}

export async function deleteSession(id: string): Promise<void> {
  const sessionDir = getSessionDir(id);
  await fs.rm(sessionDir, { recursive: true, force: true });
}

export async function archiveSession(id: string, manual = false): Promise<void> {
  const sessionDir = getSessionDir(id);
  await ensureDir(ARCHIVED_SESSIONS_DIR);
  await fs.rename(sessionDir, path.join(ARCHIVED_SESSIONS_DIR, id));
  await updateSession(id, { pinnedAt: undefined, ...(manual ? { archivedManually: true } : {}) });
}

export async function unarchiveSession(id: string): Promise<void> {
  await ensureDir(SESSIONS_DIR);
  await fs.rename(path.join(ARCHIVED_SESSIONS_DIR, id), path.join(SESSIONS_DIR, id));
  await updateSession(id, { archivedManually: false });
}

export async function deleteProject(id: string): Promise<void> {
  const projectDir = getProjectDir(id);
  await fs.rm(projectDir, { recursive: true, force: true });
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export async function getAppSettings(): Promise<AppSettings> {
  const config = await readJson<ArondoConfigWithSettings>(ARONDO_CONFIG_FILE, {});
  return config.setitngs || {};
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return withFileLock(ARONDO_CONFIG_FILE, async () => {
    const config = await readJson<ArondoConfigWithSettings>(ARONDO_CONFIG_FILE, {});
    const current = config.setitngs || {};
    const updated = { ...current, ...patch };
    await writeJson(ARONDO_CONFIG_FILE, { ...config, setitngs: updated });
    return updated;
  });
}

export async function getSessionArchiveDays(): Promise<number> {
  const settings = await getAppSettings();
  return settings.sessionArchiveDays || SESSION_ARCHIVE_DAYS_DEFAULT;
}

export async function getShowHiddenFiles(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.showHiddenFiles !== undefined ? settings.showHiddenFiles : FILE_SHOW_HIDDEN_DEFAULT;
}

export async function getShowTempDirSessions(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.showTempDirSessions !== undefined ? settings.showTempDirSessions : false;
}

export async function getEnableAutomodel(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.enableAutomodel !== undefined ? settings.enableAutomodel : false;
}

export async function getSessionArchiveAgeMs(): Promise<number> {
  const days = await getSessionArchiveDays();
  return days * 24 * 60 * 60 * 1000;
}
