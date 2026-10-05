import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { getConfigDir } from "./config";

type Migration = (context: { configDir: string }) => Promise<void> | void;

export async function runMigrations(): Promise<void> {
  const migrationDir = path.join(process.cwd(), "migration");
  let entries: string[];
  try {
    entries = await fs.readdir(migrationDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const scripts = entries
    .filter((entry) => /^\d{4}-\d{2}-\d{2}-.+\.mjs$/.test(entry))
    .sort();

  for (const script of scripts) {
    const migrationModule = await import(pathToFileURL(path.join(migrationDir, script)).href) as { default?: Migration; migrate?: Migration };
    const migrate = migrationModule.default ?? migrationModule.migrate;
    if (!migrate) {
      throw new Error(`Migration ${script} must export a default function or migrate function`);
    }
    await migrate({ configDir: getConfigDir() });
    console.log(`[migration] completed ${script}`);
  }
}
