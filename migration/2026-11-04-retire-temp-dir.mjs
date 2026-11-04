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

async function collectTempDirProjectIds(projectsDir) {
  const tempDirProjectIds = new Set();
  let entries;
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return tempDirProjectIds;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectFile = path.join(projectsDir, entry.name, "project.json");
    const project = await readJsonIfExists(projectFile);
    if (project?.tempDir === true) {
      tempDirProjectIds.add(project.id || entry.name);
      tempDirProjectIds.add(entry.name);
    }
  }
  return tempDirProjectIds;
}

async function migrateSessionsInContainer(containerDir, tempDirProjectIds) {
  let entries;
  try {
    entries = await fs.readdir(containerDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  let migrated = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionFile = path.join(containerDir, entry.name, "session.json");
    const session = await readJsonIfExists(sessionFile);
    if (!session) continue;

    const fromTempDirProject = Boolean(session.projectId && tempDirProjectIds.has(session.projectId));
    if (session.tempDir !== true && !fromTempDirProject) continue;

    session.automation = true;
    session.noProject = true;
    delete session.tempDir;
    delete session.projectId;
    await writeJsonAtomic(sessionFile, session);
    migrated += 1;
  }
  return migrated;
}

async function migrateSettings(configDir) {
  const configFile = path.join(configDir, "arondo.json");
  const config = await readJsonIfExists(configFile);
  if (!config || typeof config.setitngs !== "object" || config.setitngs === null) return;

  const settings = config.setitngs;
  if (settings.showTempDirSessions === undefined && settings.tempDirProjectRetentionHours === undefined) {
    return;
  }
  if (settings.showTempDirSessions === true && settings.showAutomationSessions === undefined) {
    settings.showAutomationSessions = true;
  }
  if (settings.tempDirProjectRetentionHours !== undefined && settings.automationSessionRetentionHours === undefined) {
    settings.automationSessionRetentionHours = settings.tempDirProjectRetentionHours;
  }
  delete settings.showTempDirSessions;
  delete settings.tempDirProjectRetentionHours;
  await writeJsonAtomic(configFile, config);
}

export default async function migrateTempDirRecords({ configDir }) {
  const projectsDir = path.join(configDir, "projects");
  const tempDirProjectIds = await collectTempDirProjectIds(projectsDir);

  const migratedCounts = await Promise.all([
    migrateSessionsInContainer(path.join(configDir, "sessions"), tempDirProjectIds),
    migrateSessionsInContainer(path.join(configDir, "archived", "sessions"), tempDirProjectIds),
    migrateSessionsInContainer(path.join(configDir, "deleted-sessions"), tempDirProjectIds),
  ]);

  for (const projectId of tempDirProjectIds) {
    await fs.rm(path.join(projectsDir, projectId), { recursive: true, force: true });
  }

  await migrateSettings(configDir);

  const totalSessions = migratedCounts.reduce((sum, count) => sum + count, 0);
  console.log(`[migration] migrated ${totalSessions} tempDir sessions and removed ${tempDirProjectIds.size} temporary project records`);
}
