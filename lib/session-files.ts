import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getConfigDir } from "./config";
import { getArondoToken, verifySessionPermission } from "./auth";

const MIME_MAP: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  // Documents & Data
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export function isImageFileName(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"].includes(ext);
}

export function extractOriginalFileName(storedFilename: string): string {
  const match = storedFilename.match(/^\d+_(.+)$/);
  return match ? match[1] : storedFilename;
}

export function resolveSessionFilesDir(sessionId: string): string | null {
  const safeSessionId = path.basename(sessionId);
  const activeDir = path.join(getConfigDir(), "sessions", safeSessionId, "files");
  if (fsSync.existsSync(activeDir)) {
    return activeDir;
  }
  const archivedDir = path.join(getConfigDir(), "archived", "sessions", safeSessionId, "files");
  if (fsSync.existsSync(archivedDir)) {
    return archivedDir;
  }
  return null;
}

export interface LocatedSessionFile {
  diskPath: string;
  diskFilename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export async function locateSessionFile(
  sessionId: string,
  filename: string
): Promise<LocatedSessionFile | null> {
  const filesDir = resolveSessionFilesDir(sessionId);
  if (!filesDir) {
    return null;
  }

  const safeName = path.basename(filename);
  if (!safeName || safeName === "." || safeName === "..") {
    return null;
  }

  const directPath = path.join(filesDir, safeName);
  try {
    const stat = await fs.stat(directPath);
    if (stat.isFile()) {
      return {
        diskPath: directPath,
        diskFilename: safeName,
        originalName: extractOriginalFileName(safeName),
        size: stat.size,
        mimeType: getMimeType(safeName),
      };
    }
  } catch {
    // Not directly found, search with prefix
  }

  try {
    const entries = await fs.readdir(filesDir);
    const matches: Array<{ name: string; timestamp: number; stat: any }> = [];
    for (const entry of entries) {
      if (entry === safeName || entry.endsWith(`_${safeName}`)) {
        const fullPath = path.join(filesDir, entry);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile()) {
            const timestampMatch = entry.match(/^(\d+)_/);
            const timestamp = timestampMatch ? parseInt(timestampMatch[1], 10) : stat.mtimeMs;
            matches.push({ name: entry, timestamp, stat });
          }
        } catch {
          // Ignore unreadable entries
        }
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Sort newest first
    matches.sort((a, b) => b.timestamp - a.timestamp);
    const chosen = matches[0];
    return {
      diskPath: path.join(filesDir, chosen.name),
      diskFilename: chosen.name,
      originalName: extractOriginalFileName(chosen.name),
      size: chosen.stat.size,
      mimeType: getMimeType(chosen.name),
    };
  } catch {
    return null;
  }
}

export async function handleSessionFileRequest(
  req: NextRequest,
  sessionId: string,
  targetFilename: string
): Promise<Response> {
  const token = getArondoToken(req);
  if (!(await verifySessionPermission(sessionId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await locateSessionFile(sessionId, targetFilename);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const isDownload =
    req.nextUrl.searchParams.get("download") === "1" ||
    req.nextUrl.searchParams.get("download") === "true";

  const buffer = await fs.readFile(file.diskPath);
  const headers = new Headers();
  headers.set("Content-Type", file.mimeType);
  headers.set("Content-Length", String(file.size));
  headers.set("Cache-Control", "private, max-age=3600");

  const encodedFilename = encodeURIComponent(file.originalName);
  if (isDownload) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
  } else {
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
  }

  return new Response(buffer, {
    status: 200,
    headers,
  });
}
