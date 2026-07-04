import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getConfigDir } from "@/lib/config";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";

const CONFIG_DIR = getConfigDir();

export async function GET(req: NextRequest) {
  const runnerId = req.nextUrl.searchParams.get("runnerId");
  if (!runnerId) {
    return NextResponse.json({ claude: null, antigravity: null });
  }

  const token = getArondoToken(req);
  if (!(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agentDir = path.join(CONFIG_DIR, "agents", runnerId);
  const read = async (filename: string) => {
    try {
      const raw = await fs.readFile(path.join(agentDir, filename), "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const [claude, antigravity] = await Promise.all([
    read("claude.json"),
    read("antigravity.json"),
  ]);

  return NextResponse.json({ claude, antigravity });
}

export const dynamic = "force-dynamic";
