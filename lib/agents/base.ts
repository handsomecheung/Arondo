export const PROMPT_ENV_VAR = "ARONDO_PROMPT_FILE";

/**
 * Base interface for all AI agent adapters.
 * To add a new agent, implement this interface and register it in AgentFactory.
 */
export interface AgentRunOptions {
  /** The user's prompt / task description */
  prompt: string;
  /** Absolute path to the git repository to work in */
  repoPath: string;
  /** Called when a line of output is received from the agent */
  onOutput?: (line: string) => void;
  /** The ID of the session */
  sessionId?: string;
  /** Whether to resume from a previous run in the session */
  isResume?: boolean;
}


export abstract class BaseAgent {
  abstract readonly name: string;

  /** Get the command string that will be executed */
  abstract getCommand(options: Omit<AgentRunOptions, "onOutput">): string;

  /** Append system constraints to the prompt */
  protected getSystemPrompt(prompt: string): string {
    return prompt;
  }

  /** Build the full prompt (including any system constraints) to send to the runner */
  public buildPrompt(prompt: string): string {
    return this.getSystemPrompt(prompt);
  }
}
