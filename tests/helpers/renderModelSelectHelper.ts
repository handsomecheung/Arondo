import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionView from '../../components/SessionView';
import { DEFAULT_AGENT_MODELS } from '../../lib/agentModels';
import { AGENT_COMMANDS } from '../../lib/agentCommands';

const baseProps: React.ComponentProps<typeof SessionView> = {
  selectedSession: null,
  selectedSessionId: null,
  isNewSession: true,
  isNewDraft: false,
  messages: [],
  execCards: new Map(),
  returnMsgIds: new Set(),
  runners: [{ id: 'runner-1', name: 'Runner 1', hostname: 'localhost', os: 'linux', arch: 'amd64', connected: true }],
  projects: [],
  runnerAgents: ['agy', 'claude', 'codex', 'opencode'],
  runnerId: 'runner-1',
  agentType: 'antigravity',
  repoPath: '/path/to/repo',
  prompt: '',
  isAgentRunning: false,
  isRunning: false,
  isArchived: false,
  onUnarchiveSession: () => {},
  isDraftSession: false,
  isDraftAutoSend: false,
  draftTrigger: 'manual',
  draftAt: null,
  sendScheduledAt: null,
  onSetSendScheduledAt: () => {},
  pendingSendTrigger: null,
  onSetPendingSendTrigger: () => {},
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
  modelDropdownOpen: true,
  selectedModel: '',
  agentModelsConfig: DEFAULT_AGENT_MODELS,
  menuRef: { current: null },
  runnerSelectRef: { current: null },
  agentSelectRef: { current: null },
  modelSelectRef: { current: null },
  chatBottomRef: { current: null },
  textareaRef: { current: null },
  renderMessageContent: (c: string) => c,
  getSendTooltip: () => '',
  isAgentAvailable: () => true,
  onSetMenuOpen: () => {},
  onSetScriptSubMenuOpen: () => {},
  onSetRunnerId: () => {},
  onSetRepoPath: () => {},
  onSetAgentType: () => {},
  onSetIsNewDraft: () => {},
  onSetDraftTrigger: () => {},
  onSetDraftAt: () => {},
  onSetRunnerDropdownOpen: () => {},
  onSetAgentDropdownOpen: () => {},
  onSetModelDropdownOpen: () => {},
  onSetSelectedModel: () => {},
  onSetFsCurrentPath: () => {},
  onSetFsModalOpen: () => {},
  onSetFsRunnerId: () => {},
  ws: null,
  onViewLog: () => {},
  onShowCommand: () => {},
  onShowPrompt: () => {},
  onStopExecCard: () => {},
  onRestartScriptCard: () => {},
  onRerunCard: () => {},
  onDeleteScriptCard: () => {},
  onSubmit: () => {},
  onSendMessage: () => {},
  onArchiveSession: () => {},
  onTogglePinSession: () => {},
  onSendDraftNow: () => {},
  onToggleDraftTrigger: () => {},
  onCancelTodo: () => {},
  onSendTodoNow: () => {},
  onChangeTodoTrigger: () => {},
  onPromptChange: () => {},
  onKeyDown: () => {},
  onRunScript: () => {},
  onDeleteSession: () => {},
  onOpenShellModal: () => {},
  onOpenFileBrowser: () => {},
  onShowDiff: () => {},
  onShowCommits: () => {},
  onOpenFilePath: () => {},
  onOpenRenameModal: () => {},
  onGoToProject: () => {},
  onNewSession: () => {},
  agentCommands: AGENT_COMMANDS,
  onNewSessionCommand: () => {},
  onRenameSessionCommand: () => {},
  onExecuteAgentCommand: () => {},
  onSelectScriptCommand: () => {},
  onTriggerRunFileSelector: () => {},
  onSwitchAgent: () => {},
  pendingFiles: [],
  onSelectFiles: () => {},
  onRemovePendingFile: () => {},
};

const agyHtml = renderToStaticMarkup(
  React.createElement(SessionView, {
    ...baseProps,
    agentType: 'antigravity',
    modelDropdownOpen: true,
  })
);

const claudeHtml = renderToStaticMarkup(
  React.createElement(SessionView, {
    ...baseProps,
    agentType: 'claude',
    modelDropdownOpen: true,
  })
);

const codexHtml = renderToStaticMarkup(
  React.createElement(SessionView, {
    ...baseProps,
    agentType: 'codex',
    modelDropdownOpen: true,
  })
);

const autoHtml = renderToStaticMarkup(
  React.createElement(SessionView, {
    ...baseProps,
    agentType: 'auto',
  })
);

const opencodeHtml = renderToStaticMarkup(
  React.createElement(SessionView, {
    ...baseProps,
    agentType: 'opencode',
  })
);

console.log(
  JSON.stringify({
    agy: {
      hasModelRow: agyHtml.includes('model-meta-row'),
      hasTrigger: agyHtml.includes('id="model-select-trigger"'),
      hasGeminiGroup: agyHtml.includes('Gemini'),
      hasAnthropicGroup: agyHtml.includes('Anthropic &amp; Other'),
      hasArgonGroup: agyHtml.includes('Gemini 4 Argon'),
      hasGeminiModel: agyHtml.includes('Gemini 3.8 Flash (High)'),
      hasClaudeModel: agyHtml.includes('Claude Sonnet 5.5 (Medium)'),
      hasArgonModel: agyHtml.includes('Gemini 4 Argon (Medium)'),
      hasGptOssModel: agyHtml.includes('GPT-OSS 120B (Medium)'),
      hasInlineCommentExcluded: !agyHtml.includes('# Best for complex tasks'),
    },
    claude: {
      hasModelRow: claudeHtml.includes('model-meta-row'),
      hasOpus: claudeHtml.includes('opus'),
      hasSonnet: claudeHtml.includes('sonnet'),
      hasHaiku: claudeHtml.includes('haiku'),
      hasArgonGroupExcluded: !claudeHtml.includes('Gemini 4 Argon'),
    },
    codex: {
      hasModelRow: codexHtml.includes('model-meta-row'),
      hasTerra: codexHtml.includes('gpt-5.6-terra'),
      hasSol: codexHtml.includes('gpt-6-sol'),
    },
    auto: {
      hasModelRow: autoHtml.includes('model-meta-row'),
    },
    opencode: {
      hasModelRow: opencodeHtml.includes('model-meta-row'),
    },
  })
);
