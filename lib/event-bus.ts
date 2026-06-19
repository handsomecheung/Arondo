/**
 * Global SSE (Server-Sent Events) event bus for real-time updates.
 * Uses a simple in-memory pub/sub pattern since we're a single-process demo server.
 */

type Listener = (event: SseEvent) => void;

export interface SseEvent {
  type: "session_updated" | "message_added" | "agent_output" | "session_deleted";
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

// Singleton instance shared across all API routes in the same server process
const globalWithBus = global as typeof global & { __iteroBus?: SseEventBus };
if (!globalWithBus.__iteroBus) {
  globalWithBus.__iteroBus = new SseEventBus();
}

export const eventBus = globalWithBus.__iteroBus;
