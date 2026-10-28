import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelDropdownOptions } from '../../components/ModelDropdownMenu';
import { AgentDropdownOptions } from '../../components/AgentDropdownMenu';
import DropdownQuotaBars from '../../components/DropdownQuotaBars';
import type { ModelQuotas } from '../../lib/agent-quota-display';

const hourReset = Math.floor(Date.now() / 1000) + 3600;
const weekReset = hourReset + 6 * 86400;
const quotas: ModelQuotas = {
  antigravity: {
    GeminiHourRemain: 0.81, GeminiWeeklyRemain: 0.62,
    OtherHourRemain: 0, OtherWeeklyRemain: 0.19,
    ArgonWeeklyRemain: 0.44,
    GeminiHourResetsAt: hourReset, GeminiWeeklyResetsAt: weekReset,
    OtherHourResetsAt: hourReset, OtherWeeklyResetsAt: weekReset, ArgonWeeklyResetsAt: weekReset,
  },
  claude: { HourRemain: 0.75, WeekRemain: 0.32, HourResetAt: hourReset, WeekResetsAt: weekReset },
  codex: { FiveHourRemain: 0.91, WeeklyRemain: 0.55, FiveHourResetAt: hourReset, WeeklyResetAt: weekReset },
};
function render(agentType: 'antigravity' | 'claude' | 'codex', data: ModelQuotas | null, loading = false, headers = false) {
  const html = renderToStaticMarkup(React.createElement(ModelDropdownOptions, {
    agentType, quotas: data, loading, selectedModel: '', onSelect: () => {},
  }));
  if (headers) return [...html.matchAll(/<div class="custom-dropdown-group-header model-quota-group-header">(.*?)<\/div>/g)].map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
function renderAgents(data: ModelQuotas | null, loading = false, commands?: string[]) {
  const html = renderToStaticMarkup(React.createElement(AgentDropdownOptions, {
    agentType: 'antigravity', quotas: data, loading,
    isAgentAvailable: (command: string) => !commands || commands.includes(command), onSelect: () => {},
  }));
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
function bars(agent: 'antigravity' | 'claude' | 'codex', group = '', data = quotas) {
  const html = renderToStaticMarkup(React.createElement(DropdownQuotaBars, { quotas: data, agent, group }));
  return [...html.matchAll(/role="progressbar".*?aria-valuenow="(\d+)".*?<span class="dropdown-quota-fill" style="([^"]*)"/g)].map((match) => ({ percent: Number(match[1]), style: match[2] }));
}
console.log(JSON.stringify({
  bars: { gemini: bars('antigravity', 'Gemini'), other: bars('antigravity', 'Other'), argon: bars('antigravity', 'Argon'), codex: bars('codex'), unknown: bars('claude', '', {}), apiKey: bars('claude', '', { claude: { IsAPIKey: true, WeekRemain: 0.8 } }), noReset: bars('claude', '', { claude: { WeekRemain: 0.2 } }) },
  agents: renderAgents(quotas),
  singleAgent: renderAgents(quotas, false, ['claude']),
  agy: render('antigravity', quotas),
  agyGroups: render('antigravity', quotas, false, true),
  claude: render('claude', quotas),
  codex: render('codex', quotas),
  unknown: renderAgents(null, false, ['codex']),
  partial: renderAgents({ claude: { HourRemain: null, WeekRemain: 0 } }, false, ['claude']),
  apiKey: renderAgents({ claude: { IsAPIKey: true, WeekRemain: 0.8 } }, false, ['claude']),
  loading: renderAgents(null, true, ['codex']),
}));
