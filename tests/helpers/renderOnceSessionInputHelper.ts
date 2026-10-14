import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionView from '../../components/SessionView';
import type { Session, Runner } from '../../types/home';
import { AGENT_COMMANDS } from '../../lib/agentCommands';

// Usage: tsx renderOnceSessionInputHelper.ts <temp-dir-once | no-path-once>
const scenario = process.argv[2] || 'temp-dir-once';

const runner: Runner = {
  id: 'runner-1',
  name: 'Runner 1',
  hostname: 'host',
  os: 'linux',
  arch: 'amd64',
  connected: true, // keep the runner online so only "once" can disable the input
};

const base: Session = {
  id: 'once-session-1',
  name: 'Once Session',
  repoPath: '/tmp/arondo-once',
  runnerId: runner.id,
  agentType: 'agy',
  status: 'done',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Session;

const session: Session =
  scenario === 'no-path-once'
    ? { ...base, noProject: true, once: true }
    : { ...base, tempDir: true, once: true };

const noop = () => {};
const props = {
  selectedSession: session,
  selectedSessionId: session.id,
  isNewSession: false,
  isNewDraft: false,
  messages: [],
  execCards: new Map(),
  returnMsgIds: new Set<string>(),
  runners: [runner],
  projects: [],
  runnerAgents: [],
  runnerId: runner.id,
  agentType: 'agy',
  repoPath: session.repoPath,
  prompt: '',
  isAgentRunning: false,
  isRunning: false,
  isArchived: false,
  onUnarchiveSession: noop,
  isDraftSession: false,
  isDraftAutoSend: false,
  draftTrigger: 'manual',
  draftAt: null,
  sendScheduledAt: null,
  onSetSendScheduledAt: noop,
  pendingSendTrigger: null,
  onSetPendingSendTrigger: noop,
  canSubmit: false,
  menuOpen: false,
  scriptSubMenuOpen: false,
  showCommandMenu: false,
  commandMenuIndex: -1,
  scriptHistory: {},
  isCheckingGitChanges: false,
  hasGitChanges: false,
  isGitRepo: true,
  runnerDropdownOpen: false,
  agentDropdownOpen: false,
  menuRef: { current: null },
  runnerSelectRef: { current: null },
  agentSelectRef: { current: null },
  chatBottomRef: { current: null },
  textareaRef: { current: null },
  renderMessageContent: (c: string) => c,
  getSendTooltip: () => '',
  isAgentAvailable: () => true,
  agentCommands: AGENT_COMMANDS,
  ws: null,
  pendingFiles: [],
} as any;

// Every remaining on* callback is a no-op via a Proxy-free explicit fill.
for (const key of [
  'onSetMenuOpen', 'onSetScriptSubMenuOpen', 'onSetRunnerId', 'onSetRepoPath', 'onSetAgentType',
  'onSetIsNewDraft', 'onSetDraftTrigger', 'onSetDraftAt', 'onSetRunnerDropdownOpen',
  'onSetAgentDropdownOpen', 'onSetFsCurrentPath', 'onSetFsModalOpen', 'onSetFsRunnerId',
  'onViewLog', 'onShowCommand', 'onShowPrompt', 'onStopExecCard', 'onRestartScriptCard',
  'onRerunCard', 'onSubmit', 'onArchiveSession', 'onTogglePinSession', 'onSendDraftNow',
  'onToggleDraftTrigger', 'onCancelTodo', 'onSendTodoNow', 'onChangeTodoTrigger',
  'onPromptChange', 'onKeyDown', 'onRunScript', 'onDeleteSession', 'onOpenShellModal',
  'onOpenFileBrowser', 'onShowDiff', 'onShowCommits', 'onOpenFilePath', 'onOpenRenameModal',
  'onGoToProject', 'onNewSession', 'onNewSessionCommand', 'onRenameSessionCommand',
  'onExecuteAgentCommand', 'onSelectScriptCommand', 'onTriggerRunFileSelector', 'onSwitchAgent',
  'onSelectFiles', 'onRemovePendingFile',
]) {
  props[key] = noop;
}

const html = renderToStaticMarkup(React.createElement(SessionView, props));
const match = html.match(/<textarea[^>]*id="chat-input"[^>]*>/);
const tag = match ? match[0] : '';
const placeholder = (tag.match(/placeholder="([^"]*)"/) || [])[1] ?? null;

console.log(
  JSON.stringify({
    found: Boolean(match),
    disabled: /\sdisabled(=|\s|>)/.test(tag),
    placeholder: placeholder === null ? null : placeholder.replace(/&#x27;/g, "'").replace(/&amp;/g, '&'),
  }),
);
