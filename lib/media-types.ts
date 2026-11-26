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
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
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

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  return MIME_MAP[ext] || "application/octet-stream";
}

export function isImageFileName(filename: string): boolean {
  const ext = getFileExtension(filename);
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"].includes(ext);
}

export function isVideoFileName(filename: string): boolean {
  const ext = getFileExtension(filename);
  return [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogg"].includes(ext);
}

export function isAudioFileName(filename: string): boolean {
  const ext = getFileExtension(filename);
  return [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext);
}

export function isMediaFileName(filename: string): boolean {
  return isImageFileName(filename) || isVideoFileName(filename) || isAudioFileName(filename);
}
