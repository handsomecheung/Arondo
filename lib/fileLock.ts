import fs from "fs/promises";
import path from "path";

// Per-file-path serialization so concurrent read-modify-write operations
// (e.g. two runners reconnecting at once, or two agent tasks finishing
// around the same time) can't race each other into a lost update or a
// corrupted file.
const fileLocks = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const resolved = path.resolve(filePath);
  const prev = fileLocks.get(resolved) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  fileLocks.set(
    resolved,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// Writes to a temp file then renames into place (atomic on POSIX), so a
// crash or a racing writer never leaves a partially-written file behind.
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}
