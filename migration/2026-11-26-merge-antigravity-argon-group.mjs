import fs from "fs/promises";
import path from "path";

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function parseModelName(line) {
  if (!line || typeof line !== "string") return "";
  const idx = line.indexOf("#");
  return (idx >= 0 ? line.slice(0, idx) : line).trim();
}

export default async function migrate({ configDir }) {
  const configFile = path.join(configDir, "arondo.json");
  const config = await readJsonIfExists(configFile);
  if (!config || typeof config !== "object") return;

  const agentModels = config.setitngs?.agentModels || config.agentModels;
  if (!agentModels || typeof agentModels !== "object") return;

  const agy = agentModels.antigravity;
  if (!agy || typeof agy !== "object" || !agy.argon) return;

  const argon = agy.argon;
  const gemini = agy.gemini || { defaultModel: "", availableModels: [] };

  const geminiModels = Array.isArray(gemini.availableModels) ? [...gemini.availableModels] : [];
  const existingNames = new Set(geminiModels.map(parseModelName).filter(Boolean));

  if (Array.isArray(argon.availableModels)) {
    for (const model of argon.availableModels) {
      const name = parseModelName(model);
      if (name && !existingNames.has(name)) {
        geminiModels.push(model);
        existingNames.add(name);
      }
    }
  }

  gemini.availableModels = geminiModels;
  agy.gemini = gemini;
  delete agy.argon;

  await writeJsonAtomic(configFile, config);
  console.log("[migration] merged antigravity argon group into gemini group");
}
