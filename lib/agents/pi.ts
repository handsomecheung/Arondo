import { BaseAgent, AgentRunOptions, PROMPT_ENV_VAR } from "./base";

/**
 * Adapter for Pi (pi).
 *
 * Prompt is passed via the env var defined by PROMPT_ENV_VAR, set by the runner.
 */
export class PiAgent extends BaseAgent {
  readonly name = "pi";

  getCommand({ sessionId, model, effort }: Omit<AgentRunOptions, "onOutput">): string {
    const sessionArg = sessionId ? ` --session-id "${sessionId}"` : "";
    const modelArg = model ? ` --model "${model}"` : "";
    const effortArg = effort ? ` --thinking "${effort}"` : "";
    return `pi -p${sessionArg}${modelArg}${effortArg} -- "$(< "$${PROMPT_ENV_VAR}")"`;
  }
}
