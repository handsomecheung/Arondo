import { readdir, stat } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path") || "/";

  // Resolve to absolute path
  const currentPath = path.resolve(requestedPath);

  try {
    const files = await readdir(currentPath, { withFileTypes: true });
    
    const dirs = [];
    for (const file of files) {
      // Skip hidden directories (dotfiles) like .git, .next, etc. to keep list clean,
      // but allow users to navigate them if they are typing manually.
      if (file.name.startsWith(".")) {
        continue;
      }
      
      try {
        const fullPath = path.join(currentPath, file.name);
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          dirs.push({
            name: file.name,
            path: fullPath,
          });
        }
      } catch {
        // Skip directories that we don't have permission to access
      }
    }

    // Sort case-insensitively
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return NextResponse.json({
      currentPath,
      parentPath: currentPath === "/" ? null : path.dirname(currentPath),
      directories: dirs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to read directory" },
      { status: 500 }
    );
  }
}
