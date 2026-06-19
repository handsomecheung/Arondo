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

export interface AgentResult {
  /** Whether the agent completed without error */
  success: boolean;
  /** Full combined stdout output */
  output: string;
  /** Error message if success is false */
  error?: string;
  /** Extracted PR URL from output, if found */
  prUrl?: string;
  /** The command that was executed */
  command?: string;
}

export abstract class BaseAgent {
  abstract readonly name: string;

  abstract run(options: AgentRunOptions): Promise<AgentResult>;

  /** Get the command string that will be executed */
  abstract getCommand(options: Omit<AgentRunOptions, "onOutput">): string;

  /** Extract a GitHub PR URL from agent output */
  protected extractPrUrl(output: string): string | undefined {
    const match = output.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/);
    return match?.[0];
  }
}
