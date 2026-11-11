import { BaseAgent } from "./base";
import { AntigravityAgent } from "./antigravity";
import { ClaudeCodeAgent } from "./claude";
import { CodexAgent } from "./codex";
import { OpencodeAgent } from "./opencode";
import { PiAgent } from "./pi";
import { getAgyQuotaGroupForModel, getConfiguredDefaultModel, getModelOptionsForAgent, isAgentQuotaExhausted, isOpencodeGoModel, selectAgent, type AgyQuotaGroup, type OpencodeQuotaRef } from "../autoagent";
import { routeModel, type AutoModelEffort, type AutoModelOption } from "../llm/automodel";
import { getAgentModelsConfig } from "../store";
import { getModelFamily, splitCodexModel } from "../llm/automodel/effort-options";
import { isAutomodelEnabled } from "../llm/config";

export type ConcreteAgentType = "antigravity" | "claude" | "codex" | "opencode" | "pi";
export type AgentType = ConcreteAgentType | "auto" | "decision";

/**
 * Registry entry: maps an agent type to its factory and the binary name
 * that should be discoverable on the runner's PATH.
 */
interface AgentEntry {
  factory: () => BaseAgent;
  /** Binary name to look up via `which` / exec.LookPath on the runner */
  binary: string;
}

const AGENTS: Record<ConcreteAgentType, AgentEntry> = {
  antigravity: { factory: () => new AntigravityAgent(), binary: "agy" },
  claude:      { factory: () => new ClaudeCodeAgent(),  binary: "claude" },
  codex:       { factory: () => new CodexAgent(),       binary: "codex" },
  opencode:    { factory: () => new OpencodeAgent(),    binary: "opencode" },
  pi:          { factory: () => new PiAgent(),          binary: "pi" },
};

/**
 * Factory to get an agent by type name.
 * To add a new agent: implement BaseAgent, add it to the AGENTS map above.
 */
export function getAgent(type: ConcreteAgentType): BaseAgent {
  const entry = AGENTS[type];
  if (!entry) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENTS).join(", ")}`);
  }
  return entry.factory();
}

export function getAvailableAgents(): ConcreteAgentType[] {
  return Object.keys(AGENTS) as ConcreteAgentType[];
}

export interface ResolvedAgent {
  agentType: ConcreteAgentType;
  model?: string;
  effort?: AutoModelEffort;
  modelOptions?: AutoModelOption[];
  agyQuotaGroup?: AgyQuotaGroup;
}

interface ResolveAgentOptions {
  opencodeQuotaRef?: OpencodeQuotaRef | null;
  prompt?: string;
  autoagentLog?: (text: string) => void | Promise<void>;
  automodelLog?: (text: string) => void | Promise<void>;
  lockedAgent?: Pick<ResolvedAgent, "agentType" | "model" | "effort" | "agyQuotaGroup">;
  once?: boolean;
  model?: string;
  previousRun?: Pick<ResolvedAgent, "agentType" | "model" | "effort">;
  context?: string;
}

/**
 * Resolves "auto" to a concrete AgentType by running the quota-based selection
 * algorithm against the agents installed on the given runner.
 * Returns null when Auto Mode has no eligible choice.
 * Explicit agents keep their model family and can route effort only.
 */
export function resolveAgentType(
  agentType: ConcreteAgentType,
  runnerAgentBinaries: string[],
  options?: ResolveAgentOptions,
): Promise<ResolvedAgent>;
export function resolveAgentType(
  agentType: string,
  runnerAgentBinaries: string[],
  options?: ResolveAgentOptions,
): Promise<ResolvedAgent | null>;
export async function resolveAgentType(
  agentType: string,
  runnerAgentBinaries: string[],
  options: ResolveAgentOptions = {},
): Promise<ResolvedAgent | null> {
  const agentModels = await getAgentModelsConfig();
  if (agentType !== "auto") {
    const concrete = agentType as ConcreteAgentType;
    const configured = options.model?.trim() || getConfiguredDefaultModel(concrete, undefined, agentModels);
    const parsed: { model?: string; effort?: AutoModelEffort } = configured && (concrete === "claude" || concrete === "codex" || concrete === "pi")
      ? splitCodexModel(configured)
      : { model: configured };
    return routeSelectedAgent({
      agentType: concrete,
      model: parsed.model,
      effort: parsed.effort,
      modelOptions: getModelOptionsForAgent(concrete, getAgyQuotaGroupForModel(configured), agentModels, { includeAllOpencode: true }),
    }, options, true);
  }
  const resolved = await selectAgent(runnerAgentBinaries, options.autoagentLog, options.lockedAgent?.agentType, options.opencodeQuotaRef);
  const lockedGroup = options.lockedAgent?.agyQuotaGroup ?? getAgyQuotaGroupForModel(options.lockedAgent?.model);
  const lockedModel = options.lockedAgent?.model?.trim()
    || (options.lockedAgent
      ? getConfiguredDefaultModel(options.lockedAgent.agentType, lockedGroup, agentModels)
      : undefined);
  const lockedOpencodeEligible = options.lockedAgent?.agentType !== "opencode"
    || (runnerAgentBinaries.includes("opencode") && (!lockedModel || isOpencodeGoModel(lockedModel)));
  const useLockedAgent = options.lockedAgent && lockedOpencodeEligible
    && !await isAgentQuotaExhausted(options.lockedAgent.agentType, lockedGroup, options.opencodeQuotaRef);
  const selected = options.lockedAgent && useLockedAgent
    ? {
      ...options.lockedAgent,
      model: lockedModel,
      agyQuotaGroup: lockedGroup,
      modelOptions: getModelOptionsForAgent(
        options.lockedAgent.agentType,
        lockedGroup,
        agentModels,
      ),
    }
    : resolved;
  await options.autoagentLog?.([
    "## Result",
    JSON.stringify({
      source: useLockedAgent ? "lockedAgent" : resolved ? "quota" : "unavailable",
      lockedAgentExhausted: Boolean(options.lockedAgent && !useLockedAgent),
      lockedAgent: options.lockedAgent,
      selected,
    }, null, 2),
    "",
  ].join("\n"));
  if (!selected) return null;
  return routeSelectedAgent(selected, options, !options.once);
}

async function routeSelectedAgent(
  selected: ResolvedAgent,
  options: ResolveAgentOptions,
  effortOnly: boolean,
): Promise<ResolvedAgent> {
  const enabled = isAutomodelEnabled();
  const previous = options.previousRun;
  if (enabled && effortOnly && previous?.agentType === selected.agentType
    && getModelFamily(selected.agentType, previous.model) === getModelFamily(selected.agentType, selected.model)) {
    selected = { ...selected, model: previous.model, effort: previous.effort ?? selected.effort };
  }
  if (enabled && selected.agentType === "codex" && selected.model) {
    const parsed = splitCodexModel(selected.model);
    selected = { ...selected, model: parsed.model, effort: selected.effort ?? parsed.effort };
  }
  const routed = options.prompt && selected.modelOptions
    ? await routeModel({
      agentType: selected.agentType,
      message: options.prompt,
      defaultModel: selected.model,
      modelOptions: selected.modelOptions,
      once: options.once ?? false,
      effortOnly,
      previousEffort: selected.effort,
      context: options.context,
    }, {
      writeLog: options.automodelLog,
    })
    : null;
  if (!routed) return selected;
  return {
    agentType: selected.agentType,
    model: routed.model ?? selected.model,
    effort: routed.effort ?? selected.effort,
    agyQuotaGroup: selected.agyQuotaGroup,
  };
}

/**
 * Returns the list of binary names the server wants runners to detect.
 * Sent to runners as `queryAgents` in the `connected` event so that
 * runners never need to hard-code agent names.
 */
export function getAgentBinaryNames(): string[] {
  return Object.values(AGENTS).map((e) => e.binary);
}

export { BaseAgent, PROMPT_ENV_VAR } from "./base";
export type { AgentRunOptions } from "./base";
