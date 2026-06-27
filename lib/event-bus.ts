/**
 * Global SSE (Server-Sent Events) event bus for real-time updates.
 * Uses a simple in-memory pub/sub pattern since we're a single-process demo server.
 */

type Listener = (event: SseEvent) => void;

export interface SseEvent {
  type:
    | "session_updated"
    | "message_added"
    | "session_deleted"
    | "terminal_output"
    | "terminal_exit"
    | "project_deleted"
    | "shell_output"
    | "shell_exit";
  payload: any;
}

class SseEventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: SseEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

// Use `process` instead of `global` for the singleton — tsx (server.ts) and
// Turbopack (API routes) run in different module contexts with separate `global`
// objects, but share the same `process` object within one Node.js process.
const p = process as typeof process & { __arondoBus?: SseEventBus };
if (!p.__arondoBus) {
  p.__arondoBus = new SseEventBus();
}

export const eventBus = p.__arondoBus;
