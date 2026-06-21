import * as pty from "node-pty";

const MAX_BUFFER_SIZE = 100 * 1024; // 100KB scrollback buffer for reconnection replay

export interface PtyCreateOptions {
  command: string;
  args?: string[];
  cwd: string;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

interface PtyEntry {
  process: pty.IPty;
  buffer: string;
  alive: boolean;
  exitCode?: number;
}

class PtyManager {
  private entries = new Map<string, PtyEntry>();

  create(id: string, opts: PtyCreateOptions): void {
    if (this.entries.has(id)) {
      this.destroy(id);
    }

    const proc = pty.spawn(opts.command, opts.args ?? [], {
      name: "xterm-256color",
      cols: opts.cols ?? 120,
      rows: opts.rows ?? 30,
      cwd: opts.cwd,
      env: process.env as Record<string, string>,
    });

    const entry: PtyEntry = { process: proc, buffer: "", alive: true };
    this.entries.set(id, entry);

    proc.onData((data) => {
      entry.buffer += data;
      if (entry.buffer.length > MAX_BUFFER_SIZE) {
        entry.buffer = entry.buffer.slice(-MAX_BUFFER_SIZE);
      }
      opts.onData(data);
    });

    proc.onExit(({ exitCode }) => {
      entry.alive = false;
      entry.exitCode = exitCode;
      opts.onExit(exitCode);
    });
  }

  write(id: string, data: string): void {
    const entry = this.entries.get(id);
    if (entry?.alive) {
      entry.process.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.entries.get(id);
    if (entry?.alive) {
      entry.process.resize(cols, rows);
    }
  }

  destroy(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      if (entry.alive) {
        entry.process.kill();
      }
      this.entries.delete(id);
    }
  }

  getBuffer(id: string): string | null {
    return this.entries.get(id)?.buffer ?? null;
  }

  isAlive(id: string): boolean {
    return this.entries.get(id)?.alive ?? false;
  }
}

const p = process as typeof process & { __iteroPtyMgr?: PtyManager };
if (!p.__iteroPtyMgr) {
  p.__iteroPtyMgr = new PtyManager();
}

export const ptyManager = p.__iteroPtyMgr;
