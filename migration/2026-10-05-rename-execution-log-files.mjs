import fs from "fs/promises";
import path from "path";

const MESSAGE_ID_PATTERN = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const stdoutPattern = new RegExp(`^(${MESSAGE_ID_PATTERN})\\.log$`, "i");
const stderrPattern = new RegExp(`^(${MESSAGE_ID_PATTERN})\\.stderr\\.log$`, "i");
const htmlPattern = new RegExp(`^(${MESSAGE_ID_PATTERN})\\.html$`, "i");

async function readMessages(messagesPath) {
  try {
    const messages = JSON.parse(await fs.readFile(messagesPath, "utf8"));
    return new Map(messages.map((message) => [message.id, message.type === "script-run" ? "script" : message.type === "agent-run" || message.type === "detached-agent-run" ? "agent" : undefined]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

async function moveIfNeeded(sourcePath, destinationPath) {
  try {
    await fs.access(destinationPath);
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.rename(sourcePath, destinationPath);
  return true;
}

async function migrateLogs(logDir, messagesPath) {
  const messageKinds = await readMessages(messagesPath);
  let entries;
  try {
    entries = await fs.readdir(logDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  let moved = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const stdout = entry.name.match(stdoutPattern);
    const stderr = entry.name.match(stderrPattern);
    const html = entry.name.match(htmlPattern);
    const messageId = stdout?.[1] ?? stderr?.[1] ?? html?.[1];
    const kind = messageId ? messageKinds.get(messageId) : undefined;
    if (!messageId || !kind || (html && kind !== "agent")) continue;

    const destination = html
      ? `${messageId}.agent.stdout.html`
      : `${messageId}.${kind}.${stderr ? "stderr" : "stdout"}.md`;
    if (await moveIfNeeded(path.join(logDir, entry.name), path.join(logDir, destination))) {
      moved += 1;
    }
  }
  return moved;
}

async function migrateContainer(containerDir) {
  let entries;
  try {
    entries = await fs.readdir(containerDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  let moved = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const itemDir = path.join(containerDir, entry.name);
    moved += await migrateLogs(path.join(itemDir, "logs"), path.join(itemDir, "messages.json"));
  }
  return moved;
}

export default async function migrateExecutionLogFiles({ configDir }) {
  const moved = await Promise.all([
    migrateContainer(path.join(configDir, "sessions")),
    migrateContainer(path.join(configDir, "archived", "sessions")),
    migrateContainer(path.join(configDir, "projects")),
  ]);
  console.log(`[migration] renamed ${moved.reduce((total, count) => total + count, 0)} execution log files`);
};
