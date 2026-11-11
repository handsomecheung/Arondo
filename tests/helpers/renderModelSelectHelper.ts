import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionView from '../../components/SessionView';
import SessionAgentSwitchMenu from '../../components/SessionAgentSwitchMenu';
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

const chips = (html: string) =>
  [...html.matchAll(/<button([^>]*)>([^<]+)<\/button>/g)]
    .filter((match) => match[1].includes('sidebar-mode-tab'))
    .map((match) => ({ label: match[2], selected: match[1].includes('aria-selected="true"') }));

const agyEffortHtml = renderToStaticMarkup(
  React.createElement(SessionView, { ...baseProps, agentType: 'antigravity', selectedModel: 'Gemini 4 Argon (Medium)', modelDropdownOpen: false })
);
const claudeEffortHtml = renderToStaticMarkup(
  React.createElement(SessionView, { ...baseProps, agentType: 'claude', selectedModel: 'opus', modelDropdownOpen: false })
);
const opencodeEffortHtml = renderToStaticMarkup(
  React.createElement(SessionView, { ...baseProps, agentType: 'opencode', selectedModel: 'opencode-go/minimax-m3', modelDropdownOpen: false })
);
const headerEffortHtml = renderToStaticMarkup(
  React.createElement(SessionAgentSwitchMenu, {
    runnerId: 'runner-1',
    agentType: 'opencode',
    selectedModel: 'opencode-go/minimax-m3#thinking',
    config: DEFAULT_AGENT_MODELS,
    isAgentAvailable: () => true,
    onSelect: () => {},
    position: { top: 0, left: 0 },
  })
);
const agyNoModelEffortHtml = renderToStaticMarkup(
  React.createElement(SessionView, { ...baseProps, agentType: 'antigravity', selectedModel: '', modelDropdownOpen: false })
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
      hasGeminiModel: agyHtml.includes('dropdown-option-name">Gemini 3.8 Flash<'),
      hasClaudeModel: agyHtml.includes('dropdown-option-name">Claude Sonnet 5.5<'),
      hasArgonModel: agyHtml.includes('dropdown-option-name">Gemini 4 Argon<'),
      hasGptOssModel: agyHtml.includes('dropdown-option-name">GPT-OSS 120B<'),
      hasVariantInModelList: agyHtml.includes('(High)</span>') || agyHtml.includes('(Medium)</span>'),
      hasInlineCommentExcluded: !agyHtml.includes('# Best for complex tasks'),
      effort: chips(agyEffortHtml),
      effortWithoutModel: chips(agyNoModelEffortHtml),
    },
    effort: {
      claude: chips(claudeEffortHtml),
      opencode: chips(opencodeEffortHtml),
      header: chips(headerEffortHtml),
      headerHasMinimaxFamily: headerEffortHtml.includes('minimax-m3'),
      headerAgentRows: [...headerEffortHtml.matchAll(/dropdown-option-name">([^<]+)</g)].map((match) => match[1]),
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
      hasFreeGroup: opencodeHtml.includes('>Free</div>'),
      hasGoFree: opencodeHtml.includes('opencode-go/beam-free'),
      hasBigPickle: opencodeHtml.includes('opencode/big-pickle'),
    },
  })
);
