// Matches ANSI/ECMA-48 escape sequences (SGR color codes, cursor movement, etc.)
// found in raw PTY-captured terminal output.
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
