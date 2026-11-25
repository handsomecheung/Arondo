import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getProjectDir, getSessionDir } from "./store";

// Sessionless (project-scoped) cards have no session directory, so audio lives beside their logs.
function getTtsDir(sessionId: string, projectId?: string): string {
  return path.join(sessionId ? getSessionDir(sessionId) : getProjectDir(projectId!), "tts");
}

// The voice is part of the key so changing it regenerates audio instead of replaying the old voice.
export function ttsCacheKey(lang: string, voiceName: string, text: string): string {
  return crypto.createHash("sha256").update(`${lang}\0${voiceName}\0${text}`).digest("hex");
}

export async function getTtsAudio(sessionId: string, projectId: string | undefined, key: string): Promise<Buffer | null> {
  const file = path.join(getTtsDir(sessionId, projectId), `${key}.mp3`);
  return fsSync.existsSync(file) ? fs.readFile(file) : null;
}

export async function saveTtsAudio(sessionId: string, projectId: string | undefined, key: string, audio: Buffer): Promise<void> {
  const dir = getTtsDir(sessionId, projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${key}.mp3`), audio);
}
