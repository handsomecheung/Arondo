import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";
import { updateAppSettings, getSessionArchiveDays, getShowHiddenFiles } from "@/lib/store";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionArchiveDays = await getSessionArchiveDays();
  const showHiddenFiles = await getShowHiddenFiles();

  let version = "unknown";
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    version = packageJson.version || "unknown";
  } catch (err) {
    console.error("Failed to read package.json version:", err);
  }

  return NextResponse.json({ sessionArchiveDays, showHiddenFiles, version });
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { sessionArchiveDays, showHiddenFiles } = await request.json();
  if (sessionArchiveDays !== undefined) {
    if (typeof sessionArchiveDays !== "number" || !Number.isFinite(sessionArchiveDays) || sessionArchiveDays < 1) {
      return NextResponse.json({ error: "sessionArchiveDays must be a positive number" }, { status: 400 });
    }
  }
  if (showHiddenFiles !== undefined && typeof showHiddenFiles !== "boolean") {
    return NextResponse.json({ error: "showHiddenFiles must be a boolean" }, { status: 400 });
  }

  const patch: { sessionArchiveDays?: number; showHiddenFiles?: boolean } = {};
  if (sessionArchiveDays !== undefined) patch.sessionArchiveDays = sessionArchiveDays;
  if (showHiddenFiles !== undefined) patch.showHiddenFiles = showHiddenFiles;

  const updated = await updateAppSettings(patch);
  return NextResponse.json(updated);
}
